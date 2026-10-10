// Welcome page entry. Rendering lives in lib/welcome-view.ts so tests can mount it against a fake.

import "./welcome.css";
import { mountWelcome } from "./lib/welcome-view";

void mountWelcome(document, { api: chrome, matchMedia: (q) => window.matchMedia(q) }).then(
  (view) => {
    // Pinning happens in the browser's own menu, so look again while the page is in view.
    const check = () => {
      if (document.visibilityState === "visible") void view.checkPin();
    };
    setInterval(check, 1500);
    window.addEventListener("focus", check);
    document.addEventListener("visibilitychange", check);
  },
);
