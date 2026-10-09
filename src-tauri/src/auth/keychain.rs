//! Site credentials in the OS keychain (Credential Manager / Keychain / Secret Service). Owner: C.
//! An index of extractor+username (no secrets) is kept so the UI can list accounts.

use crate::model::SiteCredential;

pub const SERVICE: &str = "ymd";

/// Abstraction so tests never touch the real keychain.
pub trait SecretStore: Send + Sync {
    fn get(&self, extractor: &str) -> anyhow::Result<Option<(String, String)>>;
    fn set(&self, extractor: &str, username: &str, password: &str) -> anyhow::Result<()>;
    fn delete(&self, extractor: &str) -> anyhow::Result<()>;
    fn list(&self) -> anyhow::Result<Vec<SiteCredential>>;
}

/// Real store backed by the `keyring` crate; `index_file` holds the non-secret listing.
pub struct OsKeychain {
    pub index_file: std::path::PathBuf,
}

impl SecretStore for OsKeychain {
    fn get(&self, extractor: &str) -> anyhow::Result<Option<(String, String)>> {
        let _ = extractor;
        todo!("C")
    }
    fn set(&self, extractor: &str, username: &str, password: &str) -> anyhow::Result<()> {
        let _ = (extractor, username, password);
        todo!("C")
    }
    fn delete(&self, extractor: &str) -> anyhow::Result<()> {
        let _ = extractor;
        todo!("C")
    }
    fn list(&self) -> anyhow::Result<Vec<SiteCredential>> {
        todo!("C")
    }
}
