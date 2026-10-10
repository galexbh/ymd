// Thin wrappers over the Tauri plugins the screens use (dialog, opener, os, drag-drop).
// Every call is guarded so a missing plugin (tests, mock mode) degrades quietly.
import { open } from "@tauri-apps/plugin-dialog";
import { openPath, openUrl, revealItemInDir } from "@tauri-apps/plugin-opener";

export type OsPlatform = "windows" | "macos" | "linux" | "other";

/** Ask for a folder; null when the user closes the picker. */
export async function pickFolder(defaultPath?: string | null): Promise<string | null> {
  const picked = await open({
    directory: true,
    multiple: false,
    defaultPath: defaultPath ?? undefined,
  });
  return typeof picked === "string" ? picked : null;
}

/** Ask for a cookies.txt file; null when the user closes the picker. */
export async function pickCookieFile(filterName: string): Promise<string | null> {
  const picked = await open({
    directory: false,
    multiple: false,
    filters: [{ name: filterName, extensions: ["txt"] }],
  });
  return typeof picked === "string" ? picked : null;
}

export async function openFile(path: string): Promise<void> {
  await openPath(path);
}

/** Open a web page in the default browser. */
export async function openExternal(url: string): Promise<void> {
  await openUrl(url);
}

export async function showInFolder(path: string): Promise<void> {
  await revealItemInDir(path);
}

/** Same source as `@tauri-apps/plugin-os` `platform()` (injected by the os plugin). */
export function osPlatform(): OsPlatform {
  try {
    const p = (window as { __TAURI_OS_PLUGIN_INTERNALS__?: { platform?: string } })
      .__TAURI_OS_PLUGIN_INTERNALS__?.platform;
    return p === "windows" || p === "macos" || p === "linux" ? p : "other";
  } catch {
    return "other";
  }
}

export async function copyText(text: string): Promise<boolean> {
  try {
    await navigator.clipboard.writeText(text);
    return true;
  } catch {
    return false;
  }
}

/** Parent folder of a file path, for either separator. */
export function parentDir(path: string): string {
  const i = Math.max(path.lastIndexOf("\\"), path.lastIndexOf("/"));
  return i > 0 ? path.slice(0, i) : path;
}

export type DropHandler = (e: {
  type: "enter" | "over" | "leave" | "drop";
  paths: string[];
}) => void;

/** Native file drag-and-drop over the webview. Returns an unsubscribe. */
export async function onFileDrop(handler: DropHandler): Promise<() => void> {
  try {
    const { getCurrentWebview } = await import("@tauri-apps/api/webview");
    const un = await getCurrentWebview().onDragDropEvent((ev) => {
      const p = ev.payload;
      handler({ type: p.type, paths: "paths" in p ? p.paths : [] });
    });
    return un;
  } catch {
    return () => {};
  }
}
