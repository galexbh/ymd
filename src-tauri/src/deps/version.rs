//! Running a tool to read its version, and parsing each tool's version banner. Owner: A.

use std::path::Path;
use std::process::Stdio;
use std::sync::LazyLock;
use std::time::Duration;

/// Which banner format to expect.
#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub enum Tool {
    Ytdlp,
    Ffmpeg,
    Deno,
    Node,
    Bun,
    Quickjs,
    Aria2c,
    AtomicParsley,
}

pub const PROBE_TIMEOUT: Duration = Duration::from_secs(10);

static RE_FFMPEG: LazyLock<regex::Regex> =
    LazyLock::new(|| regex::Regex::new(r"(?m)^ff(?:mpeg|probe) version (\S+)").unwrap());
static RE_DENO: LazyLock<regex::Regex> =
    LazyLock::new(|| regex::Regex::new(r"(?m)^deno (\S+)").unwrap());
static RE_ARIA2: LazyLock<regex::Regex> =
    LazyLock::new(|| regex::Regex::new(r"(?m)^aria2 version (\S+)").unwrap());
static RE_ATOMIC: LazyLock<regex::Regex> =
    LazyLock::new(|| regex::Regex::new(r"AtomicParsley version:?\s+(\S+)").unwrap());
static RE_ATOMIC_FULL: LazyLock<regex::Regex> = LazyLock::new(|| {
    regex::Regex::new(r"AtomicParsley version:?\s+(\d+\.\d+)\.\d+\s+([0-9a-f]{7,40})\b").unwrap()
});
static RE_QJS: LazyLock<regex::Regex> =
    LazyLock::new(|| regex::Regex::new(r"QuickJS(-ng)? version (\S+)").unwrap());
static RE_SEMVER: LazyLock<regex::Regex> =
    LazyLock::new(|| regex::Regex::new(r"v?(\d+\.\d+\.\d+\S*)").unwrap());

fn first_line(out: &str) -> Option<String> {
    out.lines()
        .map(str::trim)
        .find(|l| !l.is_empty())
        .map(|l| l.chars().take(64).collect())
}

/// Extract a clean version string from a tool's `--version`-style output.
pub fn parse(tool: Tool, output: &str) -> Option<String> {
    let cap = |re: &regex::Regex, group: usize| {
        re.captures(output)
            .and_then(|c| c.get(group))
            .map(|m| m.as_str().to_string())
    };
    match tool {
        Tool::Ytdlp => first_line(output),
        Tool::Ffmpeg => cap(&RE_FFMPEG, 1),
        Tool::Deno => cap(&RE_DENO, 1),
        Tool::Aria2c => cap(&RE_ARIA2, 1),
        // Real banner: `AtomicParsley version: 20240608.083822.0 1ed9031f... (utf16)`; the
        // release tag is `20240608.083822.1ed9031`, so rebuild that form when possible.
        Tool::AtomicParsley => match RE_ATOMIC_FULL.captures(output) {
            Some(c) => Some(format!("{}.{}", &c[1], &c[2][..7])),
            None => cap(&RE_ATOMIC, 1),
        },
        Tool::Quickjs => {
            let c = RE_QJS.captures(output)?;
            let ng = c.get(1).is_some();
            let v = c.get(2)?.as_str();
            Some(if ng { format!("ng-{v}") } else { v.to_string() })
        }
        Tool::Node | Tool::Bun => {
            let line = first_line(output)?;
            RE_SEMVER
                .captures(&line)
                .and_then(|c| c.get(1))
                .map(|m| m.as_str().to_string())
        }
    }
}

/// Numeric components of a version (`2.9.7` → `[2,9,7]`, `2024-01-13` → `[2024,1,13]`).
pub fn numbers(version: &str) -> Vec<u64> {
    version
        .split(|c: char| !c.is_ascii_digit())
        .filter(|s| !s.is_empty())
        .take(3)
        .filter_map(|s| s.parse().ok())
        .collect()
}

/// `a >= b` comparing the leading numeric components.
pub fn at_least(version: &str, min: &str) -> bool {
    numbers(version) >= numbers(min)
}

/// Normalized release tag / version for equality checks (`v2.9.7`, `release-1.37.0` → bare).
pub fn normalize_tag(tag: &str) -> &str {
    let t = tag.trim();
    let t = t.strip_prefix("release-").unwrap_or(t);
    t.strip_prefix('v').unwrap_or(t)
}

/// Outcome of running a tool.
#[derive(Debug, Clone, PartialEq, Eq)]
pub enum Probe {
    Version(Option<String>),
    /// Could not be started, or did not answer within the timeout.
    Failed(String),
}

/// Run `exe args...` (no shell, no console window) and parse its version.
pub async fn probe(exe: &Path, args: &[&str], tool: Tool) -> Probe {
    let mut cmd = crate::process::command(exe);
    cmd.args(args)
        .stdin(Stdio::null())
        .stdout(Stdio::piped())
        .stderr(Stdio::piped());
    let out = match tokio::time::timeout(PROBE_TIMEOUT, cmd.output()).await {
        Ok(Ok(out)) => out,
        Ok(Err(e)) => return Probe::Failed(format!("could not run {}: {e}", exe.display())),
        Err(_) => return Probe::Failed(format!("{} did not answer in time", exe.display())),
    };
    let mut text = String::from_utf8_lossy(&out.stdout).into_owned();
    text.push('\n');
    text.push_str(&String::from_utf8_lossy(&out.stderr));
    Probe::Version(parse(tool, &text))
}

#[cfg(test)]
mod tests {
    use super::*;

    fn fixture(name: &str) -> String {
        let path = Path::new(env!("CARGO_MANIFEST_DIR"))
            .join("tests/fixtures/deps/versions")
            .join(name);
        std::fs::read_to_string(&path).unwrap_or_else(|e| panic!("{}: {e}", path.display()))
    }

    /// Fixtures are real output captured on Windows from the binaries ymd installs (yt-dlp,
    /// ffmpeg, ffprobe, deno, aria2c, AtomicParsley) and from node/bun; `qjs*.txt` and
    /// `ffmpeg-brew.txt` reproduce the upstream banner formats (QuickJS help, Homebrew build).
    #[test]
    fn real_outputs() {
        let cases = [
            (Tool::Ytdlp, "yt-dlp.txt", "2026.08.19"),
            (Tool::Ffmpeg, "ffmpeg.txt", "N-127256-g538d10d187-20261008"),
            (Tool::Ffmpeg, "ffprobe.txt", "N-127256-g538d10d187-20261008"),
            (Tool::Deno, "deno.txt", "2.9.7"),
            (Tool::Node, "node.txt", "24.15.0"),
            (Tool::Bun, "bun.txt", "1.4.2"),
            (Tool::Aria2c, "aria2c.txt", "1.37.0"),
            (
                Tool::AtomicParsley,
                "atomicparsley.txt",
                "20240608.083822.1ed9031",
            ),
            (Tool::Quickjs, "qjs.txt", "2024-01-13"),
            (Tool::Quickjs, "qjs-ng.txt", "ng-0.10.1"),
            (Tool::Ffmpeg, "ffmpeg-brew.txt", "7.1.1"),
        ];
        for (tool, file, want) in cases {
            assert_eq!(parse(tool, &fixture(file)).as_deref(), Some(want), "{file}");
        }
        // Without the commit hash, fall back to the bare version token.
        assert_eq!(
            parse(
                Tool::AtomicParsley,
                "AtomicParsley version: 20210715.151551.e7ad03a"
            )
            .as_deref(),
            Some("20210715.151551.e7ad03a")
        );
    }

    #[test]
    fn garbage_does_not_parse() {
        assert_eq!(parse(Tool::Ffmpeg, "command not found"), None);
        assert_eq!(parse(Tool::Deno, ""), None);
        assert_eq!(parse(Tool::Ytdlp, "\n\n"), None);
        assert_eq!(parse(Tool::Node, "hello"), None);
    }

    #[test]
    fn comparisons() {
        assert!(at_least("2.9.7", "2.3.0"));
        assert!(at_least("2.3.0", "2.3.0"));
        assert!(!at_least("2.2.12", "2.3.0"));
        assert!(!at_least("20.18.1", "22.0.0"));
        assert!(at_least("22.0.0", "22.0.0"));
        assert!(at_least("2024-01-13", "2023-12-09"));
        assert!(!at_least("2021-03-27", "2023-12-09"));
        assert!(at_least("1.3.14", "1.3.14") && !at_least("1.3.14", "1.3.15"));
    }

    #[test]
    fn tags() {
        assert_eq!(normalize_tag("v2.9.7"), "2.9.7");
        assert_eq!(normalize_tag("release-1.37.0"), "1.37.0");
        assert_eq!(normalize_tag("2026.08.19"), "2026.08.19");
    }

    #[tokio::test]
    async fn probe_missing_exe_fails() {
        let p = probe(
            Path::new("definitely-not-a-real-tool-ymd"),
            &["--version"],
            Tool::Deno,
        )
        .await;
        assert!(matches!(p, Probe::Failed(_)));
    }
}
