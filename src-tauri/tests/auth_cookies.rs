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
fn store_info_clear() {
    let dir = tempfile::tempdir().unwrap();
    let p = paths(dir.path());
    assert!(cookies::info(&p).is_none());

    let info = cookies::store_from_extension(
        &p,
        &read("cookies_no_header_crlf.txt"),
        "extension:brave",
        Some("1.4.3"),
        false,
    )
    .unwrap();
    assert_eq!(info.origin, "extension:brave");
    assert_eq!(info.cookie_count, 2);
    assert_eq!(info.domains, ["example.org", "youtube.com"]);
    assert!(chrono::DateTime::parse_from_rfc3339(&info.created_at).is_ok());

    let again = cookies::info(&p).unwrap();
    assert_eq!(again.cookie_count, 2);
    assert_eq!(again.origin, "extension:brave");

    // A new sync replaces the copy atomically.
    let info = cookies::store_from_extension(
        &p,
        &read("cookies_valid.txt"),
        "extension:brave",
        Some("1.4.3"),
        false,
    )
    .unwrap();
    assert_eq!(info.cookie_count, 5);

    // No stray temp files are left in the auth dir (just the jar lock file).
    let mut names: Vec<String> = std::fs::read_dir(p.auth_dir())
        .unwrap()
        .map(|e| e.unwrap().file_name().to_string_lossy().into_owned())
        .collect();
    names.sort();
    assert_eq!(
        names,
        [".cookies.lock", "cookies.meta.json", "cookies.txt"],
        "{names:?}"
    );

    cookies::clear(&p).unwrap();
    assert!(cookies::info(&p).is_none());
    assert!(!p.cookies_file().exists());
    cookies::clear(&p).unwrap(); // idempotent
}

#[test]
fn store_rejects_bad_jars_and_keeps_previous() {
    let dir = tempfile::tempdir().unwrap();
    let p = paths(dir.path());
    cookies::store_from_extension(
        &p,
        &read("cookies_valid.txt"),
        "extension:brave",
        Some("1.4.3"),
        false,
    )
    .unwrap();
    for bad in ["cookies_malformed.txt", "cookies_json.txt"] {
        assert!(
            cookies::store_from_extension(&p, &read(bad), "extension:brave", Some("1.4.3"), false)
                .is_err(),
            "{bad}"
        );
    }
    assert_eq!(cookies::info(&p).unwrap().cookie_count, 5);
}

#[test]
fn info_without_meta_falls_back() {
    let dir = tempfile::tempdir().unwrap();
    let p = paths(dir.path());
    std::fs::create_dir_all(p.auth_dir()).unwrap();
    std::fs::copy(fixture("cookies_valid.txt"), p.cookies_file()).unwrap();
    let info = cookies::info(&p).unwrap();
    assert_eq!(info.origin, "unknown");
    assert_eq!(info.cookie_count, 5);
}

#[cfg(unix)]
#[test]
fn store_sets_owner_only_permissions() {
    use std::os::unix::fs::PermissionsExt;
    let dir = tempfile::tempdir().unwrap();
    let p = paths(dir.path());
    cookies::store_from_extension(
        &p,
        &read("cookies_valid.txt"),
        "extension:brave",
        Some("1.4.3"),
        false,
    )
    .unwrap();
    let mode = |f: &Path| std::fs::metadata(f).unwrap().permissions().mode() & 0o777;
    assert_eq!(mode(&p.cookies_file()), 0o600);
    assert_eq!(mode(&p.auth_dir().join("cookies.meta.json")), 0o600);
    assert_eq!(mode(&p.auth_dir()), 0o700);
}
