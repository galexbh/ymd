// Popup entry. Rendering lives in lib/popup-view.ts so tests can mount it against a fake `chrome`.

import "./popup.css";
import { mountPopup } from "./lib/popup-view";

void mountPopup(document, { api: chrome, matchMedia: (q) => window.matchMedia(q) }).then((view) => {
  // Relative times ("hace 2 min") stay true while the popup stays open.
  setInterval(view.refresh, 30_000);
});
