import "./ipc/mock/boot"; // no-op unless `vite --mode mock` (pnpm dev:mock)
import React from "react";
import ReactDOM from "react-dom/client";
import "./styles/base.css";
import { setupI18n } from "./i18n";
import { initTheme } from "./theme/useTheme";
import App from "./App";

setupI18n("system");
initTheme();

ReactDOM.createRoot(document.getElementById("root") as HTMLElement).render(
  <React.StrictMode>
    <App />
  </React.StrictMode>,
);
