//! Local structured logs: JSON lines in `<data dir>/logs/ymd.YYYY-MM-DD.jsonl` (UTC day,
//! rotated daily). Nothing is ever sent over the network.
//!
//! Every formatted record passes through [`redact`] before it reaches the file, and the
//! existing `log::*` calls are bridged into `tracing`. ymd's own events are kept from `info`
//! up; other crates only from `warn`.

use super::redact::redact;
use std::io::{self, Write};
use std::path::Path;
use tracing_appender::rolling::{RollingFileAppender, Rotation};
use tracing_subscriber::filter::{LevelFilter, Targets};
use tracing_subscriber::fmt::MakeWriter;
use tracing_subscriber::layer::SubscriberExt;
use tracing_subscriber::Layer;

pub const LOG_PREFIX: &str = "ymd";
pub const LOG_SUFFIX: &str = "jsonl";

/// Keeps the background writer alive (dropping it flushes and stops it). Managed state.
pub struct LogGuard(#[allow(dead_code)] tracing_appender::non_blocking::WorkerGuard);

/// Writer that buffers one formatted record and writes it redacted when dropped / flushed.
pub struct RedactingWriter<W: Write> {
    inner: W,
    buf: Vec<u8>,
}

impl<W: Write> RedactingWriter<W> {
    pub fn new(inner: W) -> Self {
        Self {
            inner,
            buf: Vec::new(),
        }
    }

    fn drain(&mut self) -> io::Result<()> {
        if self.buf.is_empty() {
            return Ok(());
        }
        let text = String::from_utf8_lossy(&self.buf).into_owned();
        self.buf.clear();
        self.inner.write_all(redact(&text).as_bytes())
    }
}

impl<W: Write> Write for RedactingWriter<W> {
    fn write(&mut self, buf: &[u8]) -> io::Result<usize> {
        self.buf.extend_from_slice(buf);
        Ok(buf.len())
    }
    fn flush(&mut self) -> io::Result<()> {
        self.drain()?;
        self.inner.flush()
    }
}

impl<W: Write> Drop for RedactingWriter<W> {
    fn drop(&mut self) {
        let _ = self.drain();
    }
}

/// `MakeWriter` wrapper producing [`RedactingWriter`]s.
pub struct RedactingMakeWriter<M>(pub M);

impl<'a, M: MakeWriter<'a>> MakeWriter<'a> for RedactingMakeWriter<M> {
    type Writer = RedactingWriter<M::Writer>;
    fn make_writer(&'a self) -> Self::Writer {
        RedactingWriter::new(self.0.make_writer())
    }
}

/// Daily-rotated appender writing `ymd.YYYY-MM-DD.jsonl` in `dir` (created if missing).
pub fn appender(dir: &Path) -> anyhow::Result<RollingFileAppender> {
    std::fs::create_dir_all(dir)?;
    Ok(RollingFileAppender::builder()
        .rotation(Rotation::DAILY)
        .filename_prefix(LOG_PREFIX)
        .filename_suffix(LOG_SUFFIX)
        .build(dir)?)
}

fn targets() -> Targets {
    Targets::new()
        .with_default(LevelFilter::WARN)
        .with_target("ymd_lib", LevelFilter::INFO)
        .with_target("ymd", LevelFilter::INFO)
}

/// The JSON layer every mode shares; `writer` receives already-redacted records.
pub fn json_layer<S, W>(writer: W) -> impl Layer<S> + Send + Sync + 'static
where
    S: tracing::Subscriber + for<'a> tracing_subscriber::registry::LookupSpan<'a>,
    W: for<'a> MakeWriter<'a> + Send + Sync + 'static,
{
    tracing_subscriber::fmt::layer()
        .json()
        .with_current_span(true)
        .with_span_list(false)
        .with_target(true)
        .with_writer(RedactingMakeWriter(writer))
        .with_filter(targets())
}

fn install<L>(layer: L) -> bool
where
    L: Layer<tracing_subscriber::Registry> + Send + Sync + 'static,
{
    let subscriber = tracing_subscriber::registry().with(layer);
    if tracing::subscriber::set_global_default(subscriber).is_err() {
        return false;
    }
    let _ = tracing_log::LogTracer::init_with_filter(log::LevelFilter::Info);
    true
}

/// The app: logs go through a background writer whose guard must stay alive.
pub fn init_app(dir: &Path) -> Option<LogGuard> {
    let file = match appender(dir) {
        Ok(f) => f,
        Err(e) => {
            eprintln!("ymd: logging disabled: {e:#}");
            return None;
        }
    };
    let (writer, guard) = tracing_appender::non_blocking(file);
    install(json_layer(writer)).then_some(LogGuard(guard))
}

/// The cookie-bridge host: file only and synchronous (the process exits right after
/// replying). stdout is the native-messaging channel and is never written here.
pub fn init_file_only(dir: &Path) -> bool {
    match appender(dir) {
        Ok(file) => install(json_layer(file)),
        Err(_) => false,
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    use std::sync::{Arc, Mutex};

    #[derive(Clone, Default)]
    struct Sink(Arc<Mutex<Vec<u8>>>);
    impl Write for Sink {
        fn write(&mut self, b: &[u8]) -> io::Result<usize> {
            self.0.lock().unwrap().extend_from_slice(b);
            Ok(b.len())
        }
        fn flush(&mut self) -> io::Result<()> {
            Ok(())
        }
    }
    impl<'a> MakeWriter<'a> for Sink {
        type Writer = Sink;
        fn make_writer(&'a self) -> Sink {
            self.clone()
        }
    }

    #[test]
    fn records_are_json_and_redacted() {
        let sink = Sink::default();
        let subscriber = tracing_subscriber::registry().with(json_layer(sink.clone()));
        tracing::subscriber::with_default(subscriber, || {
            let span = tracing::info_span!("job", id = "3f2a8d5e-1b2c-4d3e-8f9a-0b1c2d3e4f5a");
            let _e = span.enter();
            tracing::info!(
                detail = "https://x.com/v?token=abc --video-password hunter2",
                "stage finished"
            );
            tracing::debug!("not kept");
            tracing::info!(target: "hyper", "other crates only from warn");
        });
        let out = String::from_utf8(sink.0.lock().unwrap().clone()).unwrap();
        let lines: Vec<&str> = out.lines().collect();
        assert_eq!(lines.len(), 1, "{out}");
        let v: serde_json::Value = serde_json::from_str(lines[0]).unwrap();
        assert_eq!(v["fields"]["message"], "stage finished");
        assert_eq!(
            v["fields"]["detail"],
            "https://x.com/v?[redacted] --video-password [redacted]"
        );
        assert_eq!(v["span"]["name"], "job");
        assert_eq!(v["span"]["id"], "3f2a8d5e-1b2c-4d3e-8f9a-0b1c2d3e4f5a");
        assert!(!out.contains("hunter2") && !out.contains("abc"));
    }

    #[test]
    fn appender_names_files_by_day() {
        let dir = tempfile::tempdir().unwrap();
        let mut file = appender(&dir.path().join("logs")).unwrap();
        file.write_all(b"{}\n").unwrap();
        file.flush().unwrap();
        let names: Vec<String> = std::fs::read_dir(dir.path().join("logs"))
            .unwrap()
            .map(|e| e.unwrap().file_name().to_string_lossy().into_owned())
            .collect();
        assert_eq!(names.len(), 1);
        let re = regex::Regex::new(r"^ymd\.\d{4}-\d{2}-\d{2}\.jsonl$").unwrap();
        assert!(re.is_match(&names[0]), "{names:?}");
    }

    #[test]
    fn writer_flush_redacts_buffered_text() {
        let sink = Sink::default();
        {
            let mut w = RedactingWriter::new(sink.clone());
            w.write_all(b"Cookie: SID=1\n").unwrap();
            w.flush().unwrap();
            w.write_all(b"second C:\\Users\\ana\\x\n").unwrap();
        }
        let out = String::from_utf8(sink.0.lock().unwrap().clone()).unwrap();
        assert_eq!(out, "Cookie: [redacted]\nsecond ~\\x\n");
    }
}
