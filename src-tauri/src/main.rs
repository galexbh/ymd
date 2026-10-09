// Prevents additional console window on Windows in release, DO NOT REMOVE!!
#![cfg_attr(not(debug_assertions), windows_subsystem = "windows")]

fn main() {
    // yt-dlp calls back into this executable through `--netrc-cmd`; answer and exit before
    // any window is created.
    if let Some(code) = ymd_lib::maybe_run_netrc_helper() {
        std::process::exit(code);
    }
    ymd_lib::run()
}
