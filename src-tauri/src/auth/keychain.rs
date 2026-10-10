//! Site credentials in the OS keychain (Credential Manager / Keychain / Secret Service). Owner: C.
//! An index of extractor+username (no secrets) is kept so the UI can list accounts.
//!
//! One keychain entry per account: service [`SERVICE`], user = netrc machine / extractor key
//! (lower-cased), secret = `{"username": …, "password": …}` so a single lookup returns both.

use crate::model::SiteCredential;
use anyhow::Context;
use serde::{Deserialize, Serialize};
use std::collections::BTreeMap;
use std::path::Path;
use std::sync::Mutex;

pub const SERVICE: &str = "ymd";

/// Abstraction so tests never touch the real keychain.
pub trait SecretStore: Send + Sync {
    fn get(&self, extractor: &str) -> anyhow::Result<Option<(String, String)>>;
    fn set(&self, extractor: &str, username: &str, password: &str) -> anyhow::Result<()>;
    fn delete(&self, extractor: &str) -> anyhow::Result<()>;
    fn list(&self) -> anyhow::Result<Vec<SiteCredential>>;
}

/// Canonical key for an extractor / netrc machine name.
pub fn normalize_key(extractor: &str) -> anyhow::Result<String> {
    let key = extractor.trim().to_ascii_lowercase();
    // Same alphabet yt-dlp enforces for netrc machine names.
    let valid = !key.is_empty()
        && !key.starts_with(['-', '_'])
        && key
            .chars()
            .all(|c| c.is_ascii_alphanumeric() || matches!(c, '.' | '-' | '_'));
    anyhow::ensure!(valid, "invalid site key {extractor:?}");
    Ok(key)
}

fn validate(username: &str, password: &str) -> anyhow::Result<()> {
    anyhow::ensure!(!username.is_empty(), "username is empty");
    anyhow::ensure!(!password.is_empty(), "password is empty");
    Ok(())
}

#[derive(Serialize, Deserialize)]
struct Secret {
    username: String,
    password: String,
}

/// Real store backed by the `keyring` crate; `index_file` holds the non-secret listing.
pub struct OsKeychain {
    pub index_file: std::path::PathBuf,
}

/// Serializes read-modify-write of index files within this process.
static INDEX_LOCK: Mutex<()> = Mutex::new(());

fn read_index(file: &Path) -> anyhow::Result<Vec<SiteCredential>> {
    match std::fs::read(file) {
        Ok(bytes) => serde_json::from_slice(&bytes)
            .with_context(|| format!("reading account index {}", file.display())),
        Err(e) if e.kind() == std::io::ErrorKind::NotFound => Ok(Vec::new()),
        Err(e) => Err(e).with_context(|| format!("reading account index {}", file.display())),
    }
}

fn write_index(file: &Path, mut list: Vec<SiteCredential>) -> anyhow::Result<()> {
    list.sort_by(|a, b| a.extractor.cmp(&b.extractor));
    let json = serde_json::to_vec_pretty(&list)?;
    Ok(super::cookies::write_private(file, &json)?)
}

impl OsKeychain {
    fn entry(key: &str) -> anyhow::Result<keyring::Entry> {
        keyring::Entry::new(SERVICE, key).context("opening keychain entry")
    }

    fn update_index(&self, f: impl FnOnce(&mut Vec<SiteCredential>)) -> anyhow::Result<()> {
        let _guard = INDEX_LOCK.lock().unwrap_or_else(|e| e.into_inner());
        let mut list = read_index(&self.index_file).unwrap_or_default();
        f(&mut list);
        write_index(&self.index_file, list)
    }
}

impl SecretStore for OsKeychain {
    fn get(&self, extractor: &str) -> anyhow::Result<Option<(String, String)>> {
        let key = normalize_key(extractor)?;
        match Self::entry(&key)?.get_password() {
            Ok(raw) => {
                let s: Secret =
                    serde_json::from_str(&raw).context("keychain entry is not in ymd's format")?;
                Ok(Some((s.username, s.password)))
            }
            Err(keyring::Error::NoEntry) => Ok(None),
            Err(e) => Err(e).context("reading keychain"),
        }
    }

    fn set(&self, extractor: &str, username: &str, password: &str) -> anyhow::Result<()> {
        let key = normalize_key(extractor)?;
        validate(username, password)?;
        let secret = serde_json::to_string(&Secret {
            username: username.to_string(),
            password: password.to_string(),
        })?;
        Self::entry(&key)?
            .set_password(&secret)
            .context("writing keychain")?;
        let username = username.to_string();
        self.update_index(|list| {
            list.retain(|c| c.extractor != key);
            list.push(SiteCredential {
                extractor: key.clone(),
                username,
            });
        })
    }

    fn delete(&self, extractor: &str) -> anyhow::Result<()> {
        let key = normalize_key(extractor)?;
        match Self::entry(&key)?.delete_credential() {
            Ok(()) | Err(keyring::Error::NoEntry) => {}
            Err(e) => return Err(e).context("deleting from keychain"),
        }
        self.update_index(|list| list.retain(|c| c.extractor != key))
    }

    fn list(&self) -> anyhow::Result<Vec<SiteCredential>> {
        let mut list = read_index(&self.index_file)?;
        list.sort_by(|a, b| a.extractor.cmp(&b.extractor));
        Ok(list)
    }
}

/// In-memory store for tests (and anything that must not touch the OS keychain).
#[derive(Default)]
pub struct MemoryStore {
    entries: Mutex<BTreeMap<String, (String, String)>>,
}

impl SecretStore for MemoryStore {
    fn get(&self, extractor: &str) -> anyhow::Result<Option<(String, String)>> {
        let key = normalize_key(extractor)?;
        Ok(self.entries.lock().unwrap().get(&key).cloned())
    }
    fn set(&self, extractor: &str, username: &str, password: &str) -> anyhow::Result<()> {
        let key = normalize_key(extractor)?;
        validate(username, password)?;
        self.entries
            .lock()
            .unwrap()
            .insert(key, (username.to_string(), password.to_string()));
        Ok(())
    }
    fn delete(&self, extractor: &str) -> anyhow::Result<()> {
        let key = normalize_key(extractor)?;
        self.entries.lock().unwrap().remove(&key);
        Ok(())
    }
    fn list(&self) -> anyhow::Result<Vec<SiteCredential>> {
        Ok(self
            .entries
            .lock()
            .unwrap()
            .iter()
            .map(|(k, (u, _))| SiteCredential {
                extractor: k.clone(),
                username: u.clone(),
            })
            .collect())
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn normalize() {
        assert_eq!(normalize_key(" Vimeo ").unwrap(), "vimeo");
        assert_eq!(normalize_key("twitch.tv").unwrap(), "twitch.tv");
        assert!(normalize_key("").is_err());
        assert!(normalize_key("-x").is_err());
        assert!(normalize_key("a b").is_err());
        assert!(normalize_key("a&b").is_err());
    }

    #[test]
    fn memory_store_roundtrip() {
        let s = MemoryStore::default();
        assert_eq!(s.get("vimeo").unwrap(), None);
        s.set("Vimeo", "me", "pw").unwrap();
        s.set("niconico", "you", "pw2").unwrap();
        assert_eq!(s.get("vimeo").unwrap(), Some(("me".into(), "pw".into())));
        let l = s.list().unwrap();
        assert_eq!(
            l.iter().map(|c| c.extractor.as_str()).collect::<Vec<_>>(),
            ["niconico", "vimeo"]
        );
        s.delete("vimeo").unwrap();
        assert_eq!(s.get("vimeo").unwrap(), None);
        assert!(s.set("vimeo", "", "x").is_err());
        assert!(s.set("vimeo", "x", "").is_err());
    }

    #[test]
    fn index_file_roundtrip_has_no_secrets() {
        let dir = tempfile::tempdir().unwrap();
        let file = dir.path().join("auth").join("accounts.json");
        write_index(
            &file,
            vec![
                SiteCredential {
                    extractor: "vimeo".into(),
                    username: "me".into(),
                },
                SiteCredential {
                    extractor: "dropout".into(),
                    username: "you".into(),
                },
            ],
        )
        .unwrap();
        let text = std::fs::read_to_string(&file).unwrap();
        assert!(text.contains("\"extractor\""));
        assert!(!text.contains("password"));
        let list = read_index(&file).unwrap();
        assert_eq!(list[0].extractor, "dropout");
        assert!(read_index(&dir.path().join("missing.json"))
            .unwrap()
            .is_empty());
    }

    /// Touches the real OS keychain: run locally with `cargo test -- --ignored os_keychain`.
    #[test]
    #[ignore = "needs a real OS keychain"]
    fn os_keychain_roundtrip() {
        let dir = tempfile::tempdir().unwrap();
        let store = OsKeychain {
            index_file: dir.path().join("accounts.json"),
        };
        let key = format!("ymd-test-{}", uuid::Uuid::new_v4().simple());
        assert_eq!(store.get(&key).unwrap(), None);
        store.set(&key, "tester", "p a\"s\\s ñ").unwrap();
        assert_eq!(
            store.get(&key).unwrap(),
            Some(("tester".into(), "p a\"s\\s ñ".into()))
        );
        assert_eq!(store.list().unwrap()[0].extractor, key);
        store.delete(&key).unwrap();
        assert_eq!(store.get(&key).unwrap(), None);
        assert!(store.list().unwrap().is_empty());
        store.delete(&key).unwrap(); // idempotent
    }
}
