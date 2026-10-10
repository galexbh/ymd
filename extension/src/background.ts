// Service worker entry. All logic lives in lib/ so it can be tested against a fake `chrome`.

import { detectBrowser, type NavigatorLike } from "./lib/browser";
import { createSyncEngine, installBackground } from "./lib/sync";

const engine = createSyncEngine({
  api: chrome,
  browser: () => detectBrowser(navigator as unknown as NavigatorLike),
});

installBackground(engine, chrome);
