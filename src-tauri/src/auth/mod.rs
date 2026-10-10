//! Authentication, in layers. Owner: auth agent (C).
//! 1. cookies (`--cookies-from-browser` live, or a snapshot / imported cookies.txt);
//! 2. site accounts in the OS keychain, handed to yt-dlp through `--netrc-cmd` with ymd itself as
//!    the helper (`ymd --netrc-helper <extractor>`), so passwords never touch disk or argv;
//! 3. transient `--video-password` / `--twofactor` from the enqueue request (memory only).

pub mod browser_exe;
pub mod browsers;
pub mod cookies;
pub mod keychain;
pub mod native_host;
pub mod native_registry;
pub mod netrc;

use crate::model::{Browser, CookieSource, EnqueueRequest};
use crate::paths::AppPaths;

/// yt-dlp's name for a browser (`--cookies-from-browser NAME`).
pub fn browser_key(browser: Browser) -> &'static str {
    match browser {
        Browser::Brave => "brave",
        Browser::Chrome => "chrome",
        Browser::Chromium => "chromium",
        Browser::Edge => "edge",
        Browser::Firefox => "firefox",
        Browser::Opera => "opera",
        Browser::Safari => "safari",
        Browser::Vivaldi => "vivaldi",
        Browser::Whale => "whale",
    }
}

/// `BROWSER[:PROFILE]` for `--cookies-from-browser`. It is a single argv item, so a profile
/// with spaces (`Profile 1`) or an absolute Firefox profile path needs no quoting.
pub fn browser_spec(browser: Browser, profile: Option<&str>) -> String {
    match profile.map(str::trim).filter(|p| !p.is_empty()) {
        Some(p) => format!("{}:{p}", browser_key(browser)),
        None => browser_key(browser).to_string(),
    }
}

/// argv for a request: cookies + netrc-cmd (when any credential is stored) + transient secrets.
pub fn args_for(
    source: &CookieSource,
    paths: &AppPaths,
    has_credentials: bool,
    helper_exe: &std::path::Path,
    req: Option<&EnqueueRequest>,
) -> Vec<String> {
    let mut args = Vec::new();
    match source {
        CookieSource::None => {}
        CookieSource::Browser { browser, profile } => {
            args.push("--cookies-from-browser".to_string());
            args.push(browser_spec(*browser, profile.as_deref()));
        }
        CookieSource::File => {
            // Always ymd's own copy (snapshot or imported), never the user's original file:
            // yt-dlp writes the jar back on exit, which keeps our snapshot fresh.
            let file = paths.cookies_file();
            if file.is_file() {
                args.push("--cookies".to_string());
                args.push(file.to_string_lossy().into_owned());
            }
        }
    }
    if has_credentials {
        args.push("--netrc-cmd".to_string());
        args.push(netrc::netrc_cmd(helper_exe));
    }
    if let Some(req) = req {
        // These are short-lived by design: typed by the user for this one job, kept in memory
        // only, and gone when the yt-dlp process exits. They are the only secrets ever placed
        // in argv (yt-dlp offers no other channel for them).
        if let Some(p) = req.video_password.as_deref().filter(|p| !p.is_empty()) {
            args.push("--video-password".to_string());
            args.push(p.to_string());
        }
        if let Some(code) = req
            .twofactor
            .as_deref()
            .map(str::trim)
            .filter(|c| !c.is_empty())
        {
            args.push("--twofactor".to_string());
            args.push(code.to_string());
        }
    }
    args
}

#[cfg(test)]
mod tests {
    use super::*;
    use std::path::{Path, PathBuf};

    fn paths(root: &Path) -> AppPaths {
        AppPaths {
            bin_dir: root.join("bin"),
            data_dir: root.join("data"),
            config_dir: root.join("config"),
        }
    }

    fn req(pw: Option<&str>, tfa: Option<&str>) -> EnqueueRequest {
        EnqueueRequest {
            url: "https://example.com/v".into(),
            preset_id: "p".into(),
            playlist_items: None,
            output_dir: None,
            video_password: pw.map(Into::into),
            twofactor: tfa.map(Into::into),
            title: None,
            thumbnail: None,
        }
    }

    fn helper() -> PathBuf {
        if cfg!(windows) {
            PathBuf::from(r"C:\Program Files\ymd\ymd.exe")
        } else {
            PathBuf::from("/opt/ymd app/ymd")
        }
    }

    #[test]
    fn browser_spec_formats() {
        assert_eq!(browser_spec(Browser::Brave, None), "brave");
        assert_eq!(browser_spec(Browser::Brave, Some("")), "brave");
        assert_eq!(
            browser_spec(Browser::Brave, Some("Profile 1")),
            "brave:Profile 1"
        );
        assert_eq!(browser_spec(Browser::Edge, Some("Default")), "edge:Default");
        assert_eq!(
            browser_spec(
                Browser::Firefox,
                Some("/home/u/.mozilla/firefox/ab.default")
            ),
            "firefox:/home/u/.mozilla/firefox/ab.default"
        );
    }

    #[test]
    fn args_matrix() {
        let dir = tempfile::tempdir().unwrap();
        let p = paths(dir.path());
        let cookie_file = p.cookies_file();
        let netrc = netrc::netrc_cmd(&helper());
        let sources = [
            CookieSource::None,
            CookieSource::Browser {
                browser: Browser::Brave,
                profile: Some("Profile 1".into()),
            },
            CookieSource::Browser {
                browser: Browser::Chrome,
                profile: None,
            },
            CookieSource::File,
        ];
        let reqs = [
            None,
            Some(req(None, None)),
            Some(req(Some("vid pw"), None)),
            Some(req(None, Some(" 123456 "))),
            Some(req(Some("x"), Some("42"))),
            Some(req(Some(""), Some(""))),
        ];
        for file_exists in [false, true] {
            if file_exists {
                std::fs::create_dir_all(cookie_file.parent().unwrap()).unwrap();
                std::fs::write(&cookie_file, "# Netscape HTTP Cookie File\n").unwrap();
            }
            for source in &sources {
                for creds in [false, true] {
                    for r in &reqs {
                        let got = args_for(source, &p, creds, &helper(), r.as_ref());
                        let mut want: Vec<String> = Vec::new();
                        match source {
                            CookieSource::None => {}
                            CookieSource::Browser { browser, profile } => {
                                want.push("--cookies-from-browser".into());
                                want.push(browser_spec(*browser, profile.as_deref()));
                            }
                            CookieSource::File => {
                                if file_exists {
                                    want.push("--cookies".into());
                                    want.push(cookie_file.to_string_lossy().into_owned());
                                }
                            }
                        }
                        if creds {
                            want.push("--netrc-cmd".into());
                            want.push(netrc.clone());
                        }
                        if let Some(r) = r {
                            match r.video_password.as_deref() {
                                Some(pw) if !pw.is_empty() => {
                                    want.push("--video-password".into());
                                    want.push(pw.into());
                                }
                                _ => {}
                            }
                            match r.twofactor.as_deref().map(str::trim) {
                                Some(c) if !c.is_empty() => {
                                    want.push("--twofactor".into());
                                    want.push(c.into());
                                }
                                _ => {}
                            }
                        }
                        assert_eq!(got, want, "{source:?} creds={creds} file={file_exists}");
                    }
                }
            }
        }
    }

    #[test]
    fn args_exact_literals() {
        let dir = tempfile::tempdir().unwrap();
        let p = paths(dir.path());
        assert!(args_for(&CookieSource::None, &p, false, &helper(), None).is_empty());
        assert_eq!(
            args_for(
                &CookieSource::Browser {
                    browser: Browser::Brave,
                    profile: Some("Profile 1".into())
                },
                &p,
                false,
                &helper(),
                Some(&req(Some("s3cret"), Some("123456")))
            ),
            vec![
                "--cookies-from-browser",
                "brave:Profile 1",
                "--video-password",
                "s3cret",
                "--twofactor",
                "123456"
            ]
        );
        // File source without a file on disk adds nothing.
        assert!(args_for(&CookieSource::File, &p, false, &helper(), None).is_empty());
        let with_creds = args_for(&CookieSource::None, &p, true, &helper(), None);
        assert_eq!(with_creds[0], "--netrc-cmd");
        if cfg!(windows) {
            assert_eq!(
                with_creds[1],
                r#""C:\Program Files\ymd\ymd.exe" --netrc-helper {}"#
            );
        } else {
            assert_eq!(with_creds[1], "'/opt/ymd app/ymd' --netrc-helper {}");
        }
    }
}
