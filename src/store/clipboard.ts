// Copied links: when the window comes back (focus or visible again), look once at the
// clipboard and, if it holds a single video/audio link, hand it to the counter.
//
// Privacy: the clipboard is read only on those moments (never polled), only while the
// setting allows it, and its text is never stored, logged or sent anywhere. The only thing
// kept, in memory, is the last URL offered and the last one dismissed, so nothing repeats.
import { create } from "zustand";
import { classify } from "../app/clipboardLink";
import { api } from "../ipc/commands";
import { events } from "../ipc/events";
import { readClipboardText } from "../app/native";
import { useJobs } from "./jobs";
import { useNav } from "./nav";
import { useReceive } from "./receive";
import { useSettings } from "./settings";

/** `filled`: pasted into the empty counter and probed. `suggest`: waiting for Usar/Descartar. */
export type ClipboardOfferKind = "filled" | "suggest";

/** Where the link came from: copied, or sent with «Descargar con ymd» from the browser. */
export type ClipboardOfferSource = "clipboard" | "browser";

export interface ClipboardOffer {
  kind: ClipboardOfferKind;
  source: ClipboardOfferSource;
  url: string;
  provider: string;
  known: boolean;
}

interface ClipboardState {
  offer: ClipboardOffer | null;
  /** last URL offered (memory only) */
  lastOffered: string | null;
  /** last URL dismissed or undone (memory only) */
  dismissed: string | null;
  /** read the clipboard once and offer what it holds, if anything */
  check: () => Promise<void>;
  /** a link sent from the browser: always shown in Recibir (explicit intent, any site) */
  receiveFromBrowser: (url: string) => void;
  /** suggestion → counter: fill the field and probe */
  use: () => void;
  /** autofill → back to an empty counter */
  undo: () => void;
  dismiss: () => void;
}

/** focus and visibilitychange often arrive together; one read covers both */
export const CLIPBOARD_DEBOUNCE_MS = 120;

let checking = false;

const blank = { offer: null, lastOffered: null, dismissed: null };

function alreadyFiled(url: string): boolean {
  return Object.values(useJobs.getState().jobs).some((j) => j.url.trim() === url);
}

export const useClipboard = create<ClipboardState>((set, get) => ({
  ...blank,

  check: async () => {
    const settings = useSettings.getState().settings;
    const mode = settings?.clipboardWatch ?? "off";
    if (!settings?.onboarded || mode === "off" || checking) return;
    if (useNav.getState().route !== "receive") return;
    checking = true;
    let text: string | null;
    try {
      text = await readClipboardText();
    } finally {
      checking = false;
    }
    if (text === null) return;
    // the setting may have changed while the read was in flight
    const link = classify(text, useSettings.getState().settings?.clipboardWatch ?? "off");
    if (!link) return;
    const { lastOffered, dismissed } = get();
    if (link.url === lastOffered || link.url === dismissed || alreadyFiled(link.url)) return;

    const rx = useReceive.getState();
    const current = (rx.probe?.url ?? rx.url).trim();
    if (current === link.url) return;
    const idle = !rx.url.trim() && rx.status === "idle" && !rx.enqueueing;

    if (idle && link.known) {
      set({ lastOffered: link.url, offer: { ...link, kind: "filled", source: "clipboard" } });
      void rx.runProbe(link.url);
    } else {
      set({ lastOffered: link.url, offer: { ...link, kind: "suggest", source: "clipboard" } });
    }
  },

  receiveFromBrowser: (url) => {
    // The person picked this link in the browser: no clipboard setting or site list applies.
    const link = classify(url, "any");
    if (!link) return;
    useNav.getState().navigate("receive");
    const rx = useReceive.getState();
    const current = (rx.probe?.url ?? rx.url).trim();
    if (current === link.url) return;
    const idle = !rx.url.trim() && rx.status === "idle" && !rx.enqueueing;
    // a clipboard check right after must not offer the same link again
    set({
      lastOffered: link.url,
      dismissed: null,
      offer: { ...link, kind: idle ? "filled" : "suggest", source: "browser" },
    });
    if (idle) void rx.runProbe(link.url);
  },

  use: () => {
    const offer = get().offer;
    if (!offer) return;
    set({ offer: null });
    useReceive.getState().setUrl(offer.url);
    void useReceive.getState().runProbe(offer.url);
  },

  undo: () => {
    const offer = get().offer;
    if (!offer) return;
    set({ offer: null, dismissed: offer.url });
    useReceive.getState().reset();
  },

  dismiss: () => {
    const offer = get().offer;
    if (!offer) return;
    set({ offer: null, dismissed: offer.url });
  },
}));

/**
 * Links sent from the browser («Descargar con ymd»): one is taken at start-up (a cold start
 * carried it in argv) and then one per `app://open-url`. Before onboarding is done the link
 * waits and is shown right after. Returns the unsubscribe.
 */
export function connectBrowserLinks(): () => void {
  let alive = true;
  const take = () =>
    void api
      .takePendingUrl()
      // A taken link exists nowhere else, so it waits at module level: whichever mount is
      // alive delivers it (React remounts effects in development; settings may still load).
      .then((url) => {
        if (url) {
          waitingLink = url;
          deliverWaitingLink();
        }
      })
      .catch(() => {});
  const offSettings = useSettings.subscribe(deliverWaitingLink);
  let offEvent: (() => void) | null = null;
  void events
    .onOpenUrl(take)
    .then((un) => {
      if (alive) offEvent = un;
      else un();
    })
    .catch(() => {});
  deliverWaitingLink();
  take();
  return () => {
    alive = false;
    offSettings();
    offEvent?.();
  };
}

/** A browser link taken from the backend and not shown yet (onboarding not done). */
let waitingLink: string | null = null;

function deliverWaitingLink() {
  if (!waitingLink || !useSettings.getState().settings?.onboarded) return;
  const url = waitingLink;
  waitingLink = null;
  useClipboard.getState().receiveFromBrowser(url);
}

export function resetClipboardStore() {
  checking = false;
  waitingLink = null;
  useClipboard.setState({ ...blank });
}

/**
 * Wire the window events: one check now, then one per return to the window (focus or
 * visible again, debounced) and when the counter is opened. No timers run in between.
 * Returns the unsubscribe.
 */
export function connectClipboard(): () => void {
  if (typeof window === "undefined") return () => {};
  let timer: ReturnType<typeof setTimeout> | null = null;
  const schedule = () => {
    if (timer !== null) clearTimeout(timer);
    timer = setTimeout(() => {
      timer = null;
      void useClipboard.getState().check();
    }, CLIPBOARD_DEBOUNCE_MS);
  };
  const onVisibility = () => {
    if (document.visibilityState === "visible") schedule();
  };
  window.addEventListener("focus", schedule);
  document.addEventListener("visibilitychange", onVisibility);

  const offNav = useNav.subscribe((n, prev) => {
    if (n.route === "receive" && prev.route !== "receive") schedule();
  });
  // the offer line follows the counter: it goes once the field moves on to something else
  const offReceive = useReceive.subscribe((rx) => {
    const offer = useClipboard.getState().offer;
    if (!offer) return;
    const url = rx.url.trim();
    if (offer.kind === "filled" ? url !== offer.url : url === offer.url) {
      useClipboard.setState({ offer: null });
    }
  });

  // once at start-up, after settings decide whether to look at all
  let stopWaiting = () => {};
  const first = useSettings.getState().settings
    ? Promise.resolve()
    : new Promise<void>((resolve) => {
        const off = useSettings.subscribe((st) => {
          if (st.settings) {
            off();
            resolve();
          }
        });
        stopWaiting = () => {
          off();
          resolve();
        };
      });
  let alive = true;
  void first.then(() => {
    if (alive) schedule();
  });

  return () => {
    alive = false;
    stopWaiting();
    if (timer !== null) clearTimeout(timer);
    window.removeEventListener("focus", schedule);
    document.removeEventListener("visibilitychange", onVisibility);
    offNav();
    offReceive();
  };
}
