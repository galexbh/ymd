//! SHA-256 checksum parsing and verification. Owner: A.

use anyhow::{bail, Context};
use sha2::{Digest, Sha256};
use std::io::Read;
use std::path::Path;

fn is_sha256_hex(s: &str) -> bool {
    s.len() == 64 && s.bytes().all(|b| b.is_ascii_hexdigit())
}

/// Digest for `asset` in a `sha256sum`-style listing (`<hex>  <name>` or `<hex> *<name>`).
/// Returned lowercase.
pub fn parse_sums_file(text: &str, asset: &str) -> Option<String> {
    text.lines().find_map(|line| {
        let line = line.trim();
        let (hex, name) = line.split_once(char::is_whitespace)?;
        let name = name.trim_start().trim_start_matches('*');
        let name = name.rsplit(['/', '\\']).next().unwrap_or(name);
        (is_sha256_hex(hex) && name == asset).then(|| hex.to_ascii_lowercase())
    })
}

/// Digest from a single-asset sidecar. Accepts `sha256sum` output (`<hex>  <name>`), a bare
/// hex digest, and PowerShell `Get-FileHash | Format-List` output (`Hash : <HEX>`), which is
/// what Deno publishes for its Windows assets.
pub fn parse_sidecar(text: &str) -> Option<String> {
    text.split(|c: char| c.is_whitespace() || c == ':')
        .find(|tok| is_sha256_hex(tok))
        .map(str::to_ascii_lowercase)
}

/// Lowercase hex SHA-256 of a file (streamed).
pub fn sha256_file(path: &Path) -> anyhow::Result<String> {
    let mut f = std::fs::File::open(path).with_context(|| format!("open {}", path.display()))?;
    let mut hasher = Sha256::new();
    let mut buf = vec![0u8; 256 * 1024];
    loop {
        let n = f.read(&mut buf)?;
        if n == 0 {
            break;
        }
        hasher.update(&buf[..n]);
    }
    Ok(hex::encode(hasher.finalize()))
}

/// Fails when the file's digest differs from `expected` (case-insensitive hex).
pub fn verify_file(path: &Path, expected: &str) -> anyhow::Result<()> {
    let actual = sha256_file(path)?;
    if !actual.eq_ignore_ascii_case(expected.trim()) {
        bail!("checksum mismatch: expected {expected}, got {actual}");
    }
    Ok(())
}

#[cfg(test)]
mod tests {
    use super::*;

    const YTDLP_SUMS: &str = include_str!("../../tests/fixtures/deps/SHA2-256SUMS");
    const FFMPEG_SUMS: &str = include_str!("../../tests/fixtures/deps/checksums.sha256");
    const DENO_WIN: &str =
        include_str!("../../tests/fixtures/deps/deno-x86_64-pc-windows-msvc.zip.sha256sum");
    const DENO_LINUX: &str =
        include_str!("../../tests/fixtures/deps/deno-x86_64-unknown-linux-gnu.zip.sha256sum");

    #[test]
    fn ytdlp_sums() {
        assert_eq!(
            parse_sums_file(YTDLP_SUMS, "yt-dlp.exe").as_deref(),
            Some("66674953fe251b89f4d08c5f0e35e0728679bd67ab3d7d05c0562af101dd3e7a")
        );
        assert_eq!(
            parse_sums_file(YTDLP_SUMS, "yt-dlp_linux").as_deref(),
            Some("58162f9bfdc27458ea47bfcb311cf47028f17d8154a8bf7d689861d46399230a")
        );
        // Exact name match: `yt-dlp` must not pick up `yt-dlp.exe` and vice versa.
        assert_eq!(
            parse_sums_file(YTDLP_SUMS, "yt-dlp").as_deref(),
            Some("1fa6733c37ea6fb51c99ad8fe785e7b7e5f3246c9b980230329d4fb72ed8d4d6")
        );
        assert_eq!(parse_sums_file(YTDLP_SUMS, "yt-dlp_nope"), None);
    }

    #[test]
    fn ffmpeg_sums() {
        assert_eq!(
            parse_sums_file(FFMPEG_SUMS, "ffmpeg-master-latest-win64-gpl.zip").as_deref(),
            Some("9204f73e346578077e4691b8fa39881c43597bf5605510acae888d03931fa3b9")
        );
        assert_eq!(
            parse_sums_file(FFMPEG_SUMS, "ffmpeg-master-latest-linuxarm64-gpl.tar.xz").as_deref(),
            Some("3c74be861c70dce14701cc6d006e1960d1371211f9eb4e41ba54ac3d315ceae1")
        );
    }

    #[test]
    fn sums_binary_marker_paths_and_case() {
        let text =
            "ABCDEF0123456789abcdef0123456789abcdef0123456789abcdef0123456789 *dist/foo.zip\r\n";
        assert_eq!(
            parse_sums_file(text, "foo.zip").as_deref(),
            Some("abcdef0123456789abcdef0123456789abcdef0123456789abcdef0123456789")
        );
        assert_eq!(parse_sums_file("nothex  foo.zip", "foo.zip"), None);
    }

    #[test]
    fn deno_sidecars() {
        assert_eq!(
            parse_sidecar(DENO_WIN).as_deref(),
            Some("a0c3101b4158d1dfb7d6a78a7bf0f3de80c96bb423c152beec8beb22786f2238")
        );
        assert_eq!(
            parse_sidecar(DENO_LINUX).as_deref(),
            Some("c6527f24f4b16031d3ae4fa9f658d5f11534c8d84ce7dc8502420280919c3490")
        );
        assert_eq!(parse_sidecar("no digest here"), None);
    }

    #[test]
    fn verify_ok_and_mismatch() {
        let dir = tempfile::tempdir().unwrap();
        let f = dir.path().join("x.bin");
        std::fs::write(&f, b"hello").unwrap();
        let good = "2cf24dba5fb0a30e26e83b2ac5b9e29e1b161e5c1fa7425e73043362938b9824";
        assert_eq!(sha256_file(&f).unwrap(), good);
        verify_file(&f, good).unwrap();
        verify_file(&f, &good.to_ascii_uppercase()).unwrap();
        let bad = "0000000000000000000000000000000000000000000000000000000000000000";
        let err = verify_file(&f, bad).unwrap_err().to_string();
        assert!(err.contains("checksum mismatch"), "{err}");
    }
}
