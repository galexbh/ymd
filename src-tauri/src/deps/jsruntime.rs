//! JS runtime detection for yt-dlp-ejs. Owner: A.
//! Priority: managed Deno in bin dir, then deno, node, bun, qjs on PATH.
//!
//! Supported ranges come from the yt-dlp wiki page "EJS"
//! (<https://github.com/yt-dlp/yt-dlp/wiki/EJS>, checked 2026-10): Deno >= 2.3.0,
//! Node >= 22.0.0, Bun 1.2.11 ..= 1.3.14 (deprecated), QuickJS >= 2023-12-09 (QuickJS-NG: any).
//! Runtimes outside those ranges are left out of the result, because yt-dlp would refuse them.

use super::version::{self, Probe, Tool};
use crate::model::{JsRuntimeInfo, JsRuntimeName};
use std::path::{Path, PathBuf};

pub const DENO_MIN: &str = "2.3.0";
pub const NODE_MIN: &str = "22.0.0";
pub const BUN_MIN: &str = "1.2.11";
pub const BUN_MAX: &str = "1.3.14";
pub const QUICKJS_MIN: &str = "2023-12-09";

/// Whether yt-dlp supports this runtime version. Unknown versions get the benefit of the doubt.
pub fn supported(name: JsRuntimeName, version: Option<&str>) -> bool {
    let Some(v) = version else {
        return true;
    };
    match name {
        JsRuntimeName::Deno => version::at_least(v, DENO_MIN),
        JsRuntimeName::Node => version::at_least(v, NODE_MIN),
        JsRuntimeName::Bun => version::at_least(v, BUN_MIN) && version::at_least(BUN_MAX, v),
        // `parse` tags QuickJS-NG versions with `ng-`; every NG release is supported.
        JsRuntimeName::Quickjs => v.starts_with("ng-") || version::at_least(v, QUICKJS_MIN),
    }
}

struct Candidate {
    name: JsRuntimeName,
    path: PathBuf,
    managed: bool,
}

fn probe_spec(name: JsRuntimeName) -> (&'static [&'static str], Tool) {
    match name {
        JsRuntimeName::Deno => (&["--version"], Tool::Deno),
        JsRuntimeName::Node => (&["--version"], Tool::Node),
        JsRuntimeName::Bun => (&["--version"], Tool::Bun),
        // Both QuickJS flavours print their version in the help banner.
        JsRuntimeName::Quickjs => (&["-h"], Tool::Quickjs),
    }
}

fn same_file(a: &Path, b: &Path) -> bool {
    match (a.canonicalize(), b.canonicalize()) {
        (Ok(a), Ok(b)) => a == b,
        _ => a == b,
    }
}

/// All runtimes found, highest priority first.
pub async fn detect(bin_dir: &Path) -> Vec<JsRuntimeInfo> {
    let mut candidates = Vec::new();
    let managed_deno = bin_dir.join(crate::paths::exe_name("deno"));
    if managed_deno.is_file() {
        candidates.push(Candidate {
            name: JsRuntimeName::Deno,
            path: managed_deno.clone(),
            managed: true,
        });
    }
    for (exe, name) in [
        ("deno", JsRuntimeName::Deno),
        ("node", JsRuntimeName::Node),
        ("bun", JsRuntimeName::Bun),
        ("qjs", JsRuntimeName::Quickjs),
    ] {
        if let Ok(path) = which::which(exe) {
            if name == JsRuntimeName::Deno && same_file(&path, &managed_deno) {
                continue;
            }
            candidates.push(Candidate {
                name,
                path,
                managed: false,
            });
        }
    }

    let probes = candidates.iter().map(|c| {
        let (args, tool) = probe_spec(c.name);
        version::probe(&c.path, args, tool)
    });
    let results = futures_util::future::join_all(probes).await;

    candidates
        .into_iter()
        .zip(results)
        .filter_map(|(c, probe)| {
            let version = match probe {
                Probe::Version(v) => v,
                Probe::Failed(e) => {
                    log::info!("skipping JS runtime {}: {e}", c.path.display());
                    return None;
                }
            };
            if !supported(c.name, version.as_deref()) {
                log::info!(
                    "skipping JS runtime {} {:?}: version not supported by yt-dlp",
                    c.path.display(),
                    version
                );
                return None;
            }
            Some(JsRuntimeInfo {
                name: c.name,
                path: c.path.to_string_lossy().into_owned(),
                version,
                managed: c.managed,
            })
        })
        .collect()
}

/// The `--js-runtimes` value for yt-dlp, e.g. `node:C:\Program Files\nodejs\node.exe`.
pub fn ytdlp_arg(rt: &JsRuntimeInfo) -> String {
    let name = match rt.name {
        JsRuntimeName::Deno => "deno",
        JsRuntimeName::Node => "node",
        JsRuntimeName::Bun => "bun",
        JsRuntimeName::Quickjs => "quickjs",
    };
    format!("{name}:{}", rt.path)
}

#[cfg(test)]
mod tests {
    use super::*;
    use JsRuntimeName::*;

    #[test]
    fn minimum_versions() {
        assert!(supported(Deno, Some("2.9.7")));
        assert!(supported(Deno, Some("2.3.0")));
        assert!(!supported(Deno, Some("2.2.15")));
        assert!(!supported(Deno, Some("1.46.3")));
        assert!(supported(Node, Some("22.0.0")));
        assert!(supported(Node, Some("24.15.0")));
        assert!(!supported(Node, Some("20.18.1")));
        assert!(supported(Bun, Some("1.2.11")));
        assert!(supported(Bun, Some("1.3.14")));
        assert!(!supported(Bun, Some("1.2.10")));
        assert!(!supported(Bun, Some("1.4.2")));
        assert!(supported(Quickjs, Some("2024-01-13")));
        assert!(!supported(Quickjs, Some("2021-03-27")));
        assert!(supported(Quickjs, Some("ng-0.5.0")));
        assert!(supported(Node, None));
    }

    #[test]
    fn arg_format() {
        let rt = JsRuntimeInfo {
            name: Quickjs,
            path: "/usr/bin/qjs".into(),
            version: None,
            managed: false,
        };
        assert_eq!(ytdlp_arg(&rt), "quickjs:/usr/bin/qjs");
    }

    #[tokio::test]
    async fn detect_on_empty_bin_dir_never_reports_managed() {
        let dir = tempfile::tempdir().unwrap();
        let found = detect(dir.path()).await;
        assert!(found.iter().all(|r| !r.managed));
        for r in &found {
            assert!(supported(r.name, r.version.as_deref()));
        }
    }
}
