// Archify diagrams embedded in the docs (<iframe data-archify>): they follow the site's
// light/dark theme and grow to the diagram's height. The diagrams are same-origin files in
// /diagramas/, so the page can read and theme their document directly.
(() => {
  const theme = () => (document.documentElement.dataset.theme === "light" ? "light" : "dark");

  function fit(frame) {
    const doc = frame.contentDocument;
    if (!doc) return;
    const box = doc.querySelector(".diagram-container") || doc.body;
    const height = Math.ceil(box.getBoundingClientRect().bottom + 8);
    if (height > 0) frame.style.height = `${height}px`;
  }

  function setup(frame) {
    const url = new URL(frame.dataset.archify, document.baseURI);
    url.searchParams.set("embed", "1");
    url.searchParams.set("theme", theme());
    frame.addEventListener("load", () => {
      fit(frame);
      try {
        new ResizeObserver(() => fit(frame)).observe(frame.contentDocument.documentElement);
      } catch {
        // without ResizeObserver the first measurement stays
      }
    });
    frame.src = url.href;
  }

  function applyTheme() {
    for (const frame of document.querySelectorAll("iframe[data-archify]")) {
      const root = frame.contentDocument?.documentElement;
      if (root) root.setAttribute("data-theme", theme());
    }
  }

  function start() {
    document.querySelectorAll("iframe[data-archify]").forEach(setup);
    new MutationObserver(applyTheme).observe(document.documentElement, {
      attributes: true,
      attributeFilter: ["data-theme"],
    });
  }

  if (document.readyState === "loading") document.addEventListener("DOMContentLoaded", start);
  else start();
})();
