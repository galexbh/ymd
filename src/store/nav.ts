// In-app routing: a tiny store mirrored to the location hash (#receive, #settings/accounts).
import { create } from "zustand";

export const ROUTES = ["receive", "queue", "catalog", "deps", "settings"] as const;
export type Route = (typeof ROUTES)[number];

export const SETTINGS_SECTIONS = [
  "downloads",
  "presets",
  "accounts",
  "appearance",
  "language",
  "advanced",
] as const;
export type SettingsSection = (typeof SETTINGS_SECTIONS)[number];

interface NavState {
  route: Route;
  section: SettingsSection;
  /** bumps on every navigation so screens can move focus to their heading */
  seq: number;
  navigate: (route: Route, section?: SettingsSection) => void;
}

export function parseHash(hash: string): { route: Route; section: SettingsSection } {
  const [r, s] = hash.replace(/^#\/?/, "").split("/");
  const route = (ROUTES as readonly string[]).includes(r) ? (r as Route) : "receive";
  const section = (SETTINGS_SECTIONS as readonly string[]).includes(s)
    ? (s as SettingsSection)
    : "downloads";
  return { route, section };
}

export function toHash(route: Route, section: SettingsSection): string {
  return route === "settings" ? `#settings/${section}` : `#${route}`;
}

const initial =
  typeof window !== "undefined"
    ? parseHash(window.location.hash)
    : { route: "receive" as Route, section: "downloads" as SettingsSection };

export const useNav = create<NavState>((set, get) => ({
  ...initial,
  seq: 0,
  navigate: (route, section) => {
    const next = { route, section: section ?? get().section };
    set({ ...next, seq: get().seq + 1 });
    if (typeof window !== "undefined") {
      const h = toHash(next.route, next.section);
      if (window.location.hash !== h) {
        try {
          window.history.replaceState(null, "", h);
        } catch {
          // non-browser environments
        }
      }
    }
  },
}));

export function resetNav() {
  useNav.setState({ route: "receive", section: "downloads", seq: 0 });
}
