// Global keyboard shortcuts. Ctrl on Windows/Linux, Cmd on macOS.
import { useEffect } from "react";
import { create } from "zustand";
import { ROUTES, useNav } from "../store/nav";
import { useReceive } from "../store/receive";
import { focusUrlField, URL_INPUT_ID } from "../screens/receive/ingest";

export interface ShortcutDef {
  keys: string[];
  /** i18n key under shortcuts.* */
  id: "focusUrl" | "paste" | "settings" | "sections" | "submit" | "help";
}

export const SHORTCUTS: ShortcutDef[] = [
  { keys: ["Ctrl", "L"], id: "focusUrl" },
  { keys: ["Ctrl", "V"], id: "paste" },
  { keys: ["Enter"], id: "submit" },
  { keys: ["Ctrl", "1–5"], id: "sections" },
  { keys: ["Ctrl", ","], id: "settings" },
  { keys: ["?"], id: "help" },
];

export const useShortcutHelp = create<{ open: boolean; set: (open: boolean) => void }>((set) => ({
  open: false,
  set: (open) => set({ open }),
}));

function isEditable(el: Element | null): boolean {
  if (!el) return false;
  const tag = el.tagName;
  if (tag === "TEXTAREA" || tag === "SELECT") return true;
  if (tag === "INPUT") {
    const type = (el as HTMLInputElement).type;
    return !["checkbox", "radio", "button", "submit", "range"].includes(type);
  }
  return (el as HTMLElement).isContentEditable;
}

export function handleShortcut(e: KeyboardEvent): boolean {
  const mod = e.ctrlKey || e.metaKey;
  const nav = useNav.getState();
  const key = e.key.toLowerCase();

  if (mod && !e.altKey && !e.shiftKey) {
    if (key === "l") {
      e.preventDefault();
      if (nav.route !== "receive") nav.navigate("receive");
      focusUrlField();
      return true;
    }
    if (key === ",") {
      e.preventDefault();
      nav.navigate("settings");
      return true;
    }
    const n = Number.parseInt(e.key, 10);
    if (n >= 1 && n <= ROUTES.length) {
      e.preventDefault();
      nav.navigate(ROUTES[n - 1]);
      return true;
    }
    if (key === "v" && nav.route === "receive" && !isEditable(document.activeElement)) {
      // move focus into the empty counter so the paste lands there and is probed
      if (!useReceive.getState().url) {
        document.getElementById(URL_INPUT_ID)?.focus();
      }
      return true;
    }
  }
  if (!mod && !e.altKey && e.key === "?" && !isEditable(document.activeElement)) {
    e.preventDefault();
    useShortcutHelp.getState().set(true);
    return true;
  }
  return false;
}

export function useGlobalShortcuts() {
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.defaultPrevented) return;
      handleShortcut(e);
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, []);
}
