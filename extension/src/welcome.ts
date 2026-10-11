// Welcome page entry. Rendering lives in lib/welcome-view.ts so tests can mount it against a fake.

import "./welcome.css";
import { mountWelcome, watchPin } from "./lib/welcome-view";

void mountWelcome(document, { api: chrome, matchMedia: (q) => window.matchMedia(q) }).then(
  (view) => {
    watchPin(view.checkPin, {
      doc: document,
      win: window,
      setInterval: (fn, ms) => window.setInterval(fn, ms),
      clearInterval: (h) => window.clearInterval(h as number),
    });
  },
);
