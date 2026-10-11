// The counter: the link being handed over, its probe, the playlist selection and the
// one-off options. Video passwords and 2FA codes live here only until the job is filed.
import { create } from "zustand";
import { api, toCommandError } from "../ipc/commands";
import type { CommandError, EnqueueRequest, MediaKind, ProbeResult } from "../ipc/types";

export type ProbeStatus = "idle" | "loading" | "ready" | "error";

/** Several links pasted at once, waiting to be filed together. */
export interface Batch {
  links: string[];
  invalid: string[];
  /** valid links past the batch cap, left out */
  overflow: number;
}

interface ReceiveState {
  url: string;
  kind: MediaKind;
  /** preset chosen per kind */
  presetByKind: Partial<Record<MediaKind, string>>;
  status: ProbeStatus;
  probe: ProbeResult | null;
  probeError: CommandError | null;
  /** selected 1-based playlist indexes */
  selected: number[];
  /** anchor for shift-click ranges */
  anchor: number | null;
  videoPassword: string;
  twofactor: string;
  enqueueing: boolean;
  enqueueError: CommandError | null;
  /** the multi-link panel; null when the counter holds a single link */
  batch: Batch | null;
  /** batch option: playlist links file every entry instead of only the linked video */
  wholePlaylists: boolean;
  setUrl: (url: string) => void;
  setKind: (kind: MediaKind) => void;
  setPreset: (kind: MediaKind, id: string) => void;
  runProbe: (url?: string) => Promise<ProbeResult | null>;
  toggle: (index: number, on: boolean, extend?: boolean) => void;
  selectAll: () => void;
  selectNone: () => void;
  selectRange: (from: number, to: number) => void;
  setSecret: (field: "videoPassword" | "twofactor", value: string) => void;
  reset: () => void;
  /** build the request for the current card; null when nothing is ready */
  request: (presetId: string, outputDir: string | null) => EnqueueRequest | null;
  setEnqueueing: (on: boolean, error?: CommandError | null) => void;
  /** open the multi-link panel, clearing whatever the counter held */
  openBatch: (batch: Batch) => void;
  setWholePlaylists: (on: boolean) => void;
  /** the requests for every link of the batch; empty when there is no batch */
  batchRequests: (presetId: string, outputDir: string | null) => EnqueueRequest[];
}

let probeToken = 0;

const blank = {
  url: "",
  status: "idle" as ProbeStatus,
  probe: null,
  probeError: null,
  selected: [] as number[],
  anchor: null,
  videoPassword: "",
  twofactor: "",
  enqueueing: false,
  enqueueError: null,
  batch: null as Batch | null,
  wholePlaylists: false,
};

export const looksLikeUrl = (s: string) => /^https?:\/\/\S+\.\S+/i.test(s.trim());

export const useReceive = create<ReceiveState>((set, get) => ({
  ...blank,
  kind: "video",
  presetByKind: {},

  setUrl: (url) => {
    const changed = url.trim() !== (get().probe?.url ?? get().url).trim();
    set({ url, enqueueError: null });
    if (changed && get().status !== "idle") {
      probeToken++;
      set({ status: "idle", probe: null, probeError: null, selected: [], anchor: null });
    }
  },

  setKind: (kind) => set({ kind }),
  setPreset: (kind, id) => set({ presetByKind: { ...get().presetByKind, [kind]: id } }),

  runProbe: async (input) => {
    const url = (input ?? get().url).trim();
    if (!url) return null;
    const token = ++probeToken;
    // a single link being checked takes over from a pending batch
    set({
      url,
      status: "loading",
      probe: null,
      probeError: null,
      selected: [],
      anchor: null,
      batch: null,
    });
    try {
      const probe = await api.probe(url);
      if (token !== probeToken) return null;
      set({
        status: "ready",
        probe,
        selected: probe.kind === "playlist" ? probe.entries.map((e) => e.index) : [],
      });
      return probe;
    } catch (e) {
      if (token !== probeToken) return null;
      set({ status: "error", probeError: toCommandError(e) });
      return null;
    }
  },

  toggle: (index, on, extend) => {
    const { selected, anchor } = get();
    if (extend && anchor !== null) {
      const [a, b] = anchor < index ? [anchor, index] : [index, anchor];
      const range = new Set(selected);
      for (let i = a; i <= b; i++) {
        if (on) range.add(i);
        else range.delete(i);
      }
      set({ selected: [...range].sort((x, y) => x - y), anchor: index });
      return;
    }
    const next = on ? [...new Set([...selected, index])] : selected.filter((i) => i !== index);
    set({ selected: next.sort((x, y) => x - y), anchor: index });
  },

  selectAll: () => set({ selected: get().probe?.entries.map((e) => e.index) ?? [] }),
  selectNone: () => set({ selected: [], anchor: null }),
  selectRange: (from, to) => {
    const entries = get().probe?.entries ?? [];
    const [a, b] = from <= to ? [from, to] : [to, from];
    set({ selected: entries.map((e) => e.index).filter((i) => i >= a && i <= b) });
  },

  setSecret: (field, value) => set({ [field]: value } as Pick<ReceiveState, typeof field>),

  reset: () => {
    probeToken++;
    set({ ...blank });
  },

  request: (presetId, outputDir) => {
    const { probe, selected, videoPassword, twofactor } = get();
    if (!probe) return null;
    let playlistItems: number[] | null = null;
    if (probe.kind === "playlist") {
      if (selected.length === 0) return null;
      playlistItems = selected.length === probe.entries.length ? [] : [...selected];
    }
    return {
      url: probe.url,
      presetId,
      playlistItems,
      outputDir,
      videoPassword: videoPassword || null,
      twofactor: twofactor || null,
      title: probe.title,
      thumbnail: probe.thumbnail,
    };
  },

  setEnqueueing: (on, error = null) => set({ enqueueing: on, enqueueError: error }),

  openBatch: (batch) => {
    probeToken++;
    set({ ...blank, batch });
  },

  setWholePlaylists: (on) => set({ wholePlaylists: on }),

  batchRequests: (presetId, outputDir) => {
    const { batch, wholePlaylists } = get();
    if (!batch) return [];
    // no probe per link: titles and thumbnails arrive with the job's metadata
    return batch.links.map((url) => ({
      url,
      presetId,
      playlistItems: wholePlaylists ? [] : null,
      outputDir,
      videoPassword: null,
      twofactor: null,
      title: null,
      thumbnail: null,
    }));
  },
}));

export function resetReceiveStore() {
  probeToken++;
  useReceive.setState({ ...blank, kind: "video", presetByKind: {} });
}

/** Total seconds of the selected playlist entries. */
export function selectedDuration(probe: ProbeResult | null, selected: number[]): number {
  if (!probe) return 0;
  const set = new Set(selected);
  return probe.entries.reduce((s, e) => s + (set.has(e.index) ? (e.duration ?? 0) : 0), 0);
}
