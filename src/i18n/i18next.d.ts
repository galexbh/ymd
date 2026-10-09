import "i18next";
import type es from "./es.json";

declare module "i18next" {
  interface CustomTypeOptions {
    defaultNS: "translation";
    resources: { translation: typeof es };
  }
}
