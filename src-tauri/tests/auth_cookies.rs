//! Auth integration tests over synthetic fixtures (no real cookie values anywhere).

use std::path::{Path, PathBuf};
use ymd_lib::auth::{browsers, cookies};
use ymd_lib::paths::AppPaths;

fn fixture(name: &str) -> PathBuf {
    Path::new(env!("CARGO_MANIFEST_DIR"))
        .join("tests/fixtures/auth")
        .join(name)
}

fn read(name: &str) -> String {
    std::fs::read_to_string(fixture(name)).unwrap()
}

fn paths(root: &Path) -> AppPaths {
    AppPaths {
        bin_dir: root.join("bin"),
        data_dir: root.join("data"),
        config_dir: root.join("config"),
    }
}

#[test]
fn brave_local_state_fixture() {
    let p = browsers::parse_chromium_local_state(&read("brave_local_state.json"));
    let got: Vec<(&str, &str)> = p.iter().map(|p| (p.id.as_str(), p.name.as_str())).collect();
    assert_eq!(
        got,
        [
            ("Default", "Personal"),
            ("Profile 1", "Trabajo – Atlántida"),
            ("Profile 3", "音楽 🎧"),
        ]
    );
}

#[test]
fn chrome_local_state_fixture() {
    let p = browsers::parse_chromium_local_state(&read("chrome_local_state.json"));
    let ids: Vec<&str> = p.iter().map(|p| p.id.as_str()).collect();
    assert_eq!(ids, ["Default", "Profile 2", "Profile 12"]);
}

#[test]
fn firefox_windows_ini_fixture() {
    let p = browsers::parse_firefox_profiles_ini(&read("firefox_profiles_windows.ini"));
    let got: Vec<(&str, &str)> = p.iter().map(|p| (p.id.as_str(), p.name.as_str())).collect();
    assert_eq!(
        got,
        [
            ("Profiles/q1w2e3r4.default-release", "default-release"),
            ("Profiles/z9y8x7w6.default", "default"),
            (r"C:\Users\someone\FirefoxProfiles\musica", "Música & Vídeo"),
        ]
    );
}

#[test]
fn firefox_legacy_ini_fixture() {
    let p = browsers::parse_firefox_profiles_ini(&read("firefox_profiles_legacy_linux.ini"));
    let ids: Vec<&str> = p.iter().map(|p| p.id.as_str()).collect();
    assert_eq!(
        ids,
        [
            "e5f6g7h8.default",
            "a1b2c3d4.dev-edition-default",
            "/home/someone/ff-work"
        ]
    );
}

#[test]
fn netscape_fixtures() {
    let (n, domains) = cookies::parse_netscape(&read("cookies_valid.txt")).unwrap();
    assert_eq!(n, 5);
    assert_eq!(
        domains,
        ["google.com", "vimeo.com", "www.example.org", "youtube.com"]
    );
    assert_eq!(
        cookies::parse_netscape(&read("cookies_no_header_crlf.txt"))
            .unwrap()
            .0,
        2
    );
    let e = cookies::parse_netscape(&read("cookies_malformed.txt")).unwrap_err();
    assert!(e.to_string().contains("line 3"), "{e}");
    let e = cookies::parse_netscape(&read("cookies_json.txt")).unwrap_err();
    assert!(e.to_string().contains("JSON"), "{e}");
}

#[test]
fn import_info_clear() {
    let dir = tempfile::tempdir().unwrap();
    let p = paths(dir.path());
    assert!(cookies::info(&p).is_none());

    // The original is copied, never referenced: deleting it afterwards changes nothing.
    let original = dir.path().join("Downloads").join("cookies.txt");
    std::fs::create_dir_all(original.parent().unwrap()).unwrap();
    std::fs::copy(fixture("cookies_no_header_crlf.txt"), &original).unwrap();
    let info = cookies::import(&p, &original).unwrap();
    std::fs::remove_file(&original).unwrap();
    assert_eq!(info.origin, "import");
    assert_eq!(info.cookie_count, 2);
    assert_eq!(info.domains, ["example.org", "youtube.com"]);
    assert!(chrono::DateTime::parse_from_rfc3339(&info.created_at).is_ok());

    // Our copy gained the header yt-dlp requires and LF line ends.
    let stored = std::fs::read_to_string(p.cookies_file()).unwrap();
    assert!(stored.starts_with("# Netscape HTTP Cookie File\n"));
    assert!(!stored.contains('\r'));

    let again = cookies::info(&p).unwrap();
    assert_eq!(again.cookie_count, 2);
    assert_eq!(again.origin, "import");

    // Re-import replaces atomically.
    let info = cookies::import(&p, &fixture("cookies_valid.txt")).unwrap();
    assert_eq!(info.cookie_count, 5);

    // No stray temp files are left in the auth dir.
    let names: Vec<String> = std::fs::read_dir(p.auth_dir())
        .unwrap()
        .map(|e| e.unwrap().file_name().to_string_lossy().into_owned())
        .collect();
    let mut sorted = names.clone();
    sorted.sort();
    assert_eq!(sorted, ["cookies.meta.json", "cookies.txt"], "{names:?}");

    cookies::clear(&p).unwrap();
    assert!(cookies::info(&p).is_none());
    assert!(!p.cookies_file().exists());
    cookies::clear(&p).unwrap(); // idempotent
}

#[test]
fn import_rejects_bad_files_and_keeps_previous() {
    let dir = tempfile::tempdir().unwrap();
    let p = paths(dir.path());
    cookies::import(&p, &fixture("cookies_valid.txt")).unwrap();
    for bad in ["cookies_malformed.txt", "cookies_json.txt"] {
        assert!(cookies::import(&p, &fixture(bad)).is_err(), "{bad}");
    }
    assert!(cookies::import(&p, &dir.path().join("missing.txt")).is_err());
    assert_eq!(cookies::info(&p).unwrap().cookie_count, 5);
}

#[test]
fn info_without_meta_falls_back() {
    let dir = tempfile::tempdir().unwrap();
    let p = paths(dir.path());
    std::fs::create_dir_all(p.auth_dir()).unwrap();
    std::fs::copy(fixture("cookies_valid.txt"), p.cookies_file()).unwrap();
    let info = cookies::info(&p).unwrap();
    assert_eq!(info.origin, "import");
    assert_eq!(info.cookie_count, 5);
}

#[cfg(unix)]
#[test]
fn import_sets_owner_only_permissions() {
    use std::os::unix::fs::PermissionsExt;
    let dir = tempfile::tempdir().unwrap();
    let p = paths(dir.path());
    cookies::import(&p, &fixture("cookies_valid.txt")).unwrap();
    let mode = |f: &Path| std::fs::metadata(f).unwrap().permissions().mode() & 0o777;
    assert_eq!(mode(&p.cookies_file()), 0o600);
    assert_eq!(mode(&p.auth_dir().join("cookies.meta.json")), 0o600);
    assert_eq!(mode(&p.auth_dir()), 0o700);
}
