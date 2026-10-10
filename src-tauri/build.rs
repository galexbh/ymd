fn main() {
    // `bundle.resources` maps `../extension/dist` → `extension`, and tauri-build fails on a
    // missing resource path. The extension is built separately (`pnpm --filter extension build`
    // in CI before `tauri build`); until then an empty folder keeps `cargo build/test` working.
    // `extension_status` only reports the folder once it holds a `manifest.json`.
    let ext = std::path::Path::new(env!("CARGO_MANIFEST_DIR")).join("../extension/dist");
    if !ext.exists() {
        let _ = std::fs::create_dir_all(&ext);
    }
    tauri_build::build()
}
