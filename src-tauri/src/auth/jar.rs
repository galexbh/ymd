//! ymd's cookie jar at rest: `auth/cookies.txt` is sealed with ChaCha20-Poly1305 under a random
//! 256-bit key kept in the OS keychain (Windows Credential Manager, macOS Keychain, Secret
//! Service). Plain Netscape text only ever exists in memory and in the per-run copy yt-dlp gets
//! (`cookies::ephemeral_copy`, deleted with the job).
//!
//! Why: Chromium encrypts its own cookie store so other programs can't read it. The extension
//! bridge hands those cookies to ymd, so leaving them in a plain file would undo that protection
//! for any program running as the user.
//!
//! When the keychain is unavailable (e.g. Linux without a Secret Service) the jar falls back to a
//! plain owner-only file and says so in the log. Plain files written by older versions are
//! still read, and sealed on the next write.
//!
//! File format: `YMDJAR1\n` ‖ 12-byte nonce ‖ ciphertext+tag, with a fixed associated-data label.

use chacha20poly1305::aead::{Aead, KeyInit, Payload};
use chacha20poly1305::{ChaCha20Poly1305, Key, Nonce};
use std::sync::OnceLock;

const MAGIC: &[u8] = b"YMDJAR1\n";
const AAD: &[u8] = b"ymd cookies.txt v1";
const NONCE_LEN: usize = 12;
/// Keychain entry (service `ymd`) holding the hex key.
#[cfg_attr(any(test, feature = "test-support"), allow(dead_code))]
const KEY_ENTRY: &str = "cookie-jar-key";

pub type JarKey = [u8; 32];

pub fn is_sealed(data: &[u8]) -> bool {
    data.starts_with(MAGIC)
}

/// Encrypt `plain` under `key` with a fresh random nonce.
pub fn seal(key: &JarKey, plain: &[u8]) -> anyhow::Result<Vec<u8>> {
    let mut nonce = [0u8; NONCE_LEN];
    getrandom::fill(&mut nonce).map_err(|e| anyhow::anyhow!("no randomness: {e}"))?;
    let cipher = ChaCha20Poly1305::new(&Key::from(*key));
    let body = cipher
        .encrypt(
            &Nonce::from(nonce),
            Payload {
                msg: plain,
                aad: AAD,
            },
        )
        .map_err(|_| anyhow::anyhow!("cookie jar encryption failed"))?;
    let mut out = Vec::with_capacity(MAGIC.len() + NONCE_LEN + body.len());
    out.extend_from_slice(MAGIC);
    out.extend_from_slice(&nonce);
    out.extend_from_slice(&body);
    Ok(out)
}

/// Decrypt a sealed jar; fails on a wrong key, truncation or any tampering.
pub fn open(key: &JarKey, data: &[u8]) -> anyhow::Result<Vec<u8>> {
    let rest = data
        .strip_prefix(MAGIC)
        .ok_or_else(|| anyhow::anyhow!("not a sealed cookie jar"))?;
    anyhow::ensure!(rest.len() > NONCE_LEN, "sealed cookie jar is truncated");
    let (nonce, body) = rest.split_at(NONCE_LEN);
    let nonce: [u8; NONCE_LEN] = nonce.try_into().expect("split at NONCE_LEN");
    ChaCha20Poly1305::new(&Key::from(*key))
        .decrypt(
            &Nonce::from(nonce),
            Payload {
                msg: body,
                aad: AAD,
            },
        )
        .map_err(|_| {
            anyhow::anyhow!("the cookie jar can't be decrypted (key changed or file altered)")
        })
}

/// Plain text of a jar file's bytes: sealed jars need `key`; legacy plain files pass through.
pub fn decode(data: &[u8], key: Option<&JarKey>) -> anyhow::Result<Vec<u8>> {
    if !is_sealed(data) {
        return Ok(data.to_vec());
    }
    let key = key.ok_or_else(|| {
        anyhow::anyhow!("the cookie jar is encrypted but the keychain key is unavailable")
    })?;
    open(key, data)
}

/// Bytes to store for `plain`: sealed when a key is available, else the plain text.
pub fn encode(plain: &[u8], key: Option<&JarKey>) -> anyhow::Result<Vec<u8>> {
    match key {
        Some(k) => seal(k, plain),
        None => Ok(plain.to_vec()),
    }
}

fn parse_hex_key(hex_key: &str) -> Option<JarKey> {
    let bytes = hex::decode(hex_key.trim()).ok()?;
    bytes.try_into().ok()
}

#[cfg_attr(any(test, feature = "test-support"), allow(dead_code))]
fn new_key() -> anyhow::Result<JarKey> {
    let mut k = [0u8; 32];
    getrandom::fill(&mut k).map_err(|e| anyhow::anyhow!("no randomness: {e}"))?;
    Ok(k)
}

/// The keychain key, created on first use. `None` when the keychain can't be used.
#[cfg_attr(any(test, feature = "test-support"), allow(dead_code))]
fn keychain_key() -> Option<JarKey> {
    let entry = match keyring::Entry::new(super::keychain::SERVICE, KEY_ENTRY) {
        Ok(e) => e,
        Err(e) => {
            log::warn!("cookie jar: keychain unavailable, storing cookies unencrypted: {e}");
            return None;
        }
    };
    match entry.get_password() {
        Ok(hex_key) => match parse_hex_key(&hex_key) {
            Some(k) => return Some(k),
            None => log::warn!("cookie jar: keychain key is malformed; creating a new one"),
        },
        Err(keyring::Error::NoEntry) => {}
        Err(e) => {
            log::warn!("cookie jar: keychain unavailable, storing cookies unencrypted: {e}");
            return None;
        }
    }
    let key = new_key().ok()?;
    match entry.set_password(&hex::encode(key)) {
        Ok(()) => Some(key),
        Err(e) => {
            log::warn!(
                "cookie jar: cannot save a key in the keychain, storing cookies unencrypted: {e}"
            );
            None
        }
    }
}

/// The key for this process (looked up once). Test builds never touch the real keychain: they
/// use `YMD_JAR_KEY` (64 hex chars) when set, and plain files otherwise.
pub fn key() -> Option<JarKey> {
    static KEY: OnceLock<Option<JarKey>> = OnceLock::new();
    *KEY.get_or_init(|| {
        #[cfg(any(test, feature = "test-support"))]
        {
            std::env::var("YMD_JAR_KEY")
                .ok()
                .and_then(|k| parse_hex_key(&k))
        }
        #[cfg(not(any(test, feature = "test-support")))]
        {
            keychain_key()
        }
    })
}

#[cfg(test)]
mod tests {
    use super::*;

    const K: JarKey = [7u8; 32];
    const TEXT: &[u8] =
        b"# Netscape HTTP Cookie File\n.youtube.com\tTRUE\t/\tTRUE\t0\tSID\tsecret\n";

    #[test]
    fn round_trip_hides_the_plain_text() {
        let sealed = seal(&K, TEXT).unwrap();
        assert!(is_sealed(&sealed));
        assert!(!sealed.windows(6).any(|w| w == b"secret"));
        assert!(!sealed.windows(3).any(|w| w == b"SID"));
        assert_eq!(open(&K, &sealed).unwrap(), TEXT);
    }

    #[test]
    fn every_seal_uses_a_fresh_nonce() {
        assert_ne!(seal(&K, TEXT).unwrap(), seal(&K, TEXT).unwrap());
    }

    #[test]
    fn wrong_key_truncation_and_tampering_fail() {
        let sealed = seal(&K, TEXT).unwrap();
        assert!(open(&[8u8; 32], &sealed).is_err());
        assert!(open(&K, &sealed[..MAGIC.len() + NONCE_LEN]).is_err());
        for i in [MAGIC.len(), MAGIC.len() + NONCE_LEN, sealed.len() - 1] {
            let mut bad = sealed.clone();
            bad[i] ^= 1;
            assert!(open(&K, &bad).is_err(), "byte {i}");
        }
        assert!(open(&K, TEXT).is_err());
    }

    #[test]
    fn decode_and_encode_with_and_without_a_key() {
        // legacy plain files pass through
        assert_eq!(decode(TEXT, Some(&K)).unwrap(), TEXT);
        assert_eq!(decode(TEXT, None).unwrap(), TEXT);
        // sealed needs the key
        let sealed = encode(TEXT, Some(&K)).unwrap();
        assert_eq!(decode(&sealed, Some(&K)).unwrap(), TEXT);
        assert!(decode(&sealed, None).is_err());
        // no key: stored plain
        assert_eq!(encode(TEXT, None).unwrap(), TEXT);
    }

    #[test]
    fn hex_keys() {
        assert_eq!(parse_hex_key(&hex::encode(K)), Some(K));
        assert_eq!(parse_hex_key("abcd"), None);
        assert_eq!(parse_hex_key("zz"), None);
    }
}
