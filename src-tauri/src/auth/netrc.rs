//! `--netrc-cmd` helper: yt-dlp runs `"<ymd exe>" --netrc-helper <extractor>` and reads one
//! netrc line from stdout. Owner: C.

use super::keychain::SecretStore;

pub const HELPER_FLAG: &str = "--netrc-helper";

/// Value for yt-dlp's `--netrc-cmd` (quoted for the shell yt-dlp uses; `{}` = extractor).
pub fn netrc_cmd(helper_exe: &std::path::Path) -> String {
    let _ = helper_exe;
    todo!("C")
}

/// Pure: one netrc line. Quotes/escapes values containing whitespace.
pub fn format_line(machine: &str, login: &str, password: &str) -> String {
    let _ = (machine, login, password);
    todo!("C")
}

/// Entry point used by `main.rs` before Tauri starts. Returns the process exit code.
/// Prints nothing (exit 1) when there is no credential for the extractor.
pub fn helper_main(args: &[String], store: &dyn SecretStore) -> i32 {
    let _ = (args, store);
    todo!("C")
}
