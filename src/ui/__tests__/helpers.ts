// Self-contained test setup so these tests run under any vitest config.
import "@testing-library/jest-dom/vitest";
import { cleanup } from "@testing-library/react";
import { afterEach } from "vitest";
import { setupI18n } from "../../i18n";

setupI18n("es");
afterEach(() => cleanup());
