// Runs before first paint: restores the last applied theme from the cache
// written by src/theme/applyTheme.ts so the window never flashes.
(function () {
  try {
    var root = document.documentElement;
    var raw = localStorage.getItem("ymd.theme.v1");
    var cache = raw ? JSON.parse(raw) : null;
    var s = (cache && cache.settings) || {};
    var dark =
      s.mode === "dark" ||
      (s.mode !== "light" &&
        window.matchMedia &&
        window.matchMedia("(prefers-color-scheme: dark)").matches);
    var theme = dark ? "dark" : "light";
    root.setAttribute("data-theme", theme);
    root.setAttribute("data-density", s.density || "comfortable");
    root.setAttribute("data-radius", s.radius || "soft");
    if (typeof s.fontScale === "number")
      root.style.setProperty("--font-scale", String(s.fontScale));
    var vars = cache && cache.vars && cache.vars[theme];
    if (vars) for (var k in vars) root.style.setProperty(k, vars[k]);
  } catch (e) {
    document.documentElement.setAttribute("data-theme", "light");
  }
})();
