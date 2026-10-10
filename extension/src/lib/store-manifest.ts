// The manifest of the Chrome Web Store package (scripts/zip.mjs --store). Pure.
//
// - No `key`: the store assigns its own ID.
// - No required `host_permissions`: the store build presets no site. The person adds each one,
//   and the browser asks for that site's permission then (`optional_host_permissions`).
// The unpacked build ymd ships keeps both: a fixed ID and youtube.com preset, granted on load.

export function storeManifest(manifest: Record<string, unknown>): Record<string, unknown> {
  const out = { ...manifest };
  delete out.key;
  delete out.host_permissions;
  return out;
}
