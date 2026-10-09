// Catalog store: one page of the download history at a time.
import { create } from "zustand";
import { api, toCommandError } from "../ipc/commands";
import type { CommandError, HistoryItem, MediaKind } from "../ipc/types";

export const PAGE_SIZE = 20;

interface HistoryState {
  search: string;
  kind: MediaKind | null;
  page: number;
  items: HistoryItem[];
  total: number;
  status: "idle" | "loading" | "ready" | "error";
  error: CommandError | null;
  setSearch: (s: string) => void;
  setKind: (k: MediaKind | null) => void;
  setPage: (p: number) => void;
  refresh: () => Promise<void>;
  remove: (id: number) => Promise<void>;
  clearAll: () => Promise<void>;
}

let token = 0;

export const useHistory = create<HistoryState>((set, get) => ({
  search: "",
  kind: null,
  page: 0,
  items: [],
  total: 0,
  status: "idle",
  error: null,

  setSearch: (search) => {
    set({ search, page: 0 });
    void get().refresh();
  },
  setKind: (kind) => {
    set({ kind, page: 0 });
    void get().refresh();
  },
  setPage: (page) => {
    set({ page: Math.max(0, page) });
    void get().refresh();
  },

  refresh: async () => {
    const t = ++token;
    const { search, kind, page } = get();
    if (get().status !== "ready") set({ status: "loading" });
    try {
      const res = await api.historyQuery({
        search: search.trim() || null,
        kind,
        limit: PAGE_SIZE,
        offset: page * PAGE_SIZE,
      });
      if (t !== token) return;
      // a deletion can leave the current page empty: step back
      if (res.items.length === 0 && page > 0 && res.total > 0) {
        set({ page: Math.max(0, Math.ceil(res.total / PAGE_SIZE) - 1) });
        return get().refresh();
      }
      set({ items: res.items, total: res.total, status: "ready", error: null });
    } catch (e) {
      if (t !== token) return;
      set({ status: "error", error: toCommandError(e) });
    }
  },

  remove: async (id) => {
    await api.historyDelete(id);
    await get().refresh();
  },

  clearAll: async () => {
    await api.historyClear();
    set({ page: 0 });
    await get().refresh();
  },
}));

export function resetHistoryStore() {
  token++;
  useHistory.setState({
    search: "",
    kind: null,
    page: 0,
    items: [],
    total: 0,
    status: "idle",
    error: null,
  });
}
