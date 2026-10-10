//! The real `ymd` binary as a native-messaging host
//! (contract: `website/src/content/docs/desarrollo/puente-de-cookies.md`).
//! `YMD_DATA_DIR` points the host at a temp dir instead of the user's app data.

use serde_json::{json, Value};
use std::io::{Read, Write};
use std::path::Path;
use std::process::{Command, Stdio};
use ymd_lib::auth::native_host::EXTENSION_ID;

const YMD: &str = env!("CARGO_BIN_EXE_ymd");

fn frame(v: &Value) -> Vec<u8> {
    let body = serde_json::to_vec(v).unwrap();
    let mut out = (body.len() as u32).to_le_bytes().to_vec();
    out.extend_from_slice(&body);
    out
}

/// Run the host with `origin`, feed `input`, return (exit code, raw stdout).
fn run(origin: &str, data_dir: &Path, input: &[u8]) -> (i32, Vec<u8>) {
    let mut child = Command::new(YMD)
        .arg(origin)
        .arg("--parent-window=0")
        .env("YMD_DATA_DIR", data_dir)
        .stdin(Stdio::piped())
        .stdout(Stdio::piped())
        .stderr(Stdio::null())
        .spawn()
        .unwrap();
    // The host may exit without reading (wrong origin): ignore a broken pipe.
    let _ = child.stdin.take().unwrap().write_all(input);
    let mut out = Vec::new();
    child.stdout.take().unwrap().read_to_end(&mut out).unwrap();
    let status = child.wait().unwrap();
    (status.code().unwrap_or(-1), out)
}

fn reply(out: &[u8]) -> Value {
    assert!(out.len() >= 4, "no reply: {out:?}");
    let len = u32::from_le_bytes(out[..4].try_into().unwrap()) as usize;
    assert_eq!(out.len(), 4 + len, "exactly one message");
    serde_json::from_slice(&out[4..]).unwrap()
}

fn origin() -> String {
    format!("chrome-extension://{EXTENSION_ID}/")
}

#[test]
fn hello() {
    let dir = tempfile::tempdir().unwrap();
    let (code, out) = run(
        &origin(),
        dir.path(),
        &frame(&json!({"type": "hello", "version": 1})),
    );
    assert_eq!(code, 0);
    assert_eq!(
        reply(&out),
        json!({"ok": true, "app": "ymd", "appVersion": env!("CARGO_PKG_VERSION"), "protocol": 1})
    );
    // Without a trailing slash too.
    let (code, out) = run(
        &format!("chrome-extension://{EXTENSION_ID}"),
        dir.path(),
        &frame(&json!({"type": "hello"})),
    );
    assert_eq!(code, 0);
    assert_eq!(reply(&out)["ok"], true);
    assert!(!dir.path().join("auth").exists(), "hello writes nothing");
}

#[test]
fn cookies_are_stored() {
    let dir = tempfile::tempdir().unwrap();
    let msg = json!({
        "type": "cookies", "version": 1, "browser": "brave",
        "cookies": [
            {"domain": ".youtube.com", "hostOnly": false, "path": "/", "secure": true,
             "httpOnly": true, "session": false, "expirationDate": 1999999999.9,
             "name": "SID", "value": "synthetic-sid", "sameSite": "no_restriction"},
            {"domain": "www.youtube.com", "hostOnly": true, "path": "/", "secure": true,
             "httpOnly": false, "session": true, "name": "PREF", "value": "f6=8"},
            {"domain": ".google.com", "hostOnly": false, "path": "/", "secure": false,
             "httpOnly": false, "session": false, "expirationDate": 1800000000,
             "name": "BAD", "value": "line\nbreak"}
        ]
    });
    let (code, out) = run(&origin(), dir.path(), &frame(&msg));
    assert_eq!(code, 0);
    assert_eq!(
        reply(&out),
        json!({"ok": true, "count": 2, "domains": ["www.youtube.com", "youtube.com"]})
    );

    let jar = dir.path().join("auth").join("cookies.txt");
    assert_eq!(
        std::fs::read_to_string(&jar).unwrap(),
        "# Netscape HTTP Cookie File\n\
         #HttpOnly_.youtube.com\tTRUE\t/\tTRUE\t1999999999\tSID\tsynthetic-sid\n\
         www.youtube.com\tFALSE\t/\tTRUE\t0\tPREF\tf6=8\n"
    );
    #[cfg(unix)]
    {
        use std::os::unix::fs::PermissionsExt;
        let mode = |p: &Path| std::fs::metadata(p).unwrap().permissions().mode() & 0o777;
        assert_eq!(mode(&jar), 0o600);
        assert_eq!(mode(&dir.path().join("auth/cookies.meta.json")), 0o600);
        assert_eq!(mode(&dir.path().join("auth")), 0o700);
    }
    let meta: Value = serde_json::from_slice(
        &std::fs::read(dir.path().join("auth").join("cookies.meta.json")).unwrap(),
    )
    .unwrap();
    assert_eq!(meta["origin"], "extension:brave");
    assert!(meta["createdAt"].as_str().is_some());
    // No temp files left behind.
    let names: Vec<String> = std::fs::read_dir(dir.path().join("auth"))
        .unwrap()
        .map(|e| e.unwrap().file_name().to_string_lossy().into_owned())
        .collect();
    assert_eq!(names.len(), 2, "{names:?}");
}

#[test]
fn wrong_origin_exits_1_and_writes_nothing() {
    let dir = tempfile::tempdir().unwrap();
    let msg = json!({"type": "cookies", "browser": "brave", "cookies": [
        {"domain": "a.com", "hostOnly": true, "name": "n", "value": "v"}]});
    for bad in [
        "chrome-extension://abcdefghijklmnopabcdefghijklmnop/".to_string(),
        format!("chrome-extension://{EXTENSION_ID}/evil"),
    ] {
        let (code, out) = run(&bad, dir.path(), &frame(&msg));
        assert_eq!(code, 1, "{bad}");
        assert!(out.is_empty(), "{bad}");
    }
    assert_eq!(std::fs::read_dir(dir.path()).unwrap().count(), 0);
}

#[test]
fn bad_message_gets_error_reply() {
    let dir = tempfile::tempdir().unwrap();
    let (code, out) = run(&origin(), dir.path(), &frame(&json!({"type": "nope"})));
    assert_eq!(code, 0);
    let v = reply(&out);
    assert_eq!(v["ok"], false);
    assert_eq!(v["code"], "unknown");

    // Oversize length prefix: error reply, exit 1.
    let (code, out) = run(&origin(), dir.path(), &u32::MAX.to_le_bytes());
    assert_eq!(code, 1);
    assert_eq!(reply(&out)["ok"], false);
}
