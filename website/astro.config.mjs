// ymd documentation site: Astro Starlight, published to GitHub Pages at /ymd/.
import { fileURLToPath } from "node:url";
import starlight from "@astrojs/starlight";
import { defineConfig } from "astro/config";
import starlightLinksValidator from "starlight-links-validator";

const repoRoot = fileURLToPath(new URL("..", import.meta.url));

export default defineConfig({
  site: "https://galexbh.github.io",
  base: "/ymd",
  trailingSlash: "always",
  vite: {
    // CHANGELOG.md lives at the repo root, one level above this package.
    server: { fs: { allow: [repoRoot] } },
  },
  integrations: [
    starlight({
      title: "ymd",
      description:
        "Documentación de ymd, la aplicación de escritorio para descargar video y audio con yt-dlp.",
      logo: {
        light: "./src/assets/ymd-logo-light.svg",
        dark: "./src/assets/ymd-logo-dark.svg",
        alt: "ymd",
        replacesTitle: true,
      },
      favicon: "/favicon.svg",
      social: [{ icon: "github", label: "GitHub", href: "https://github.com/galexbh/ymd" }],
      editLink: { baseUrl: "https://github.com/galexbh/ymd/edit/main/website/" },
      lastUpdated: true,
      defaultLocale: "root",
      locales: {
        root: { label: "Español", lang: "es" },
        en: { label: "English", lang: "en" },
      },
      customCss: ["./src/styles/ymd.css"],
      plugins: [starlightLinksValidator({ errorOnInconsistentLocale: true })],
      sidebar: [
        {
          label: "Guía",
          translations: { en: "Guide" },
          items: [
            "guia/instalacion",
            "guia/primer-uso",
            "guia/descargar",
            "guia/catalogo",
            "guia/portapapeles",
            "guia/apariencia-e-idioma",
            "guia/actualizaciones",
          ],
        },
        {
          label: "Cookies y cuentas",
          translations: { en: "Cookies and accounts" },
          items: [
            "cookies/por-que",
            "cookies/extension",
            "cookies/navegador",
            "cookies/cookies-txt",
            "cookies/cuentas",
          ],
        },
        "dependencias",
        "solucion-de-problemas",
        {
          label: "Desarrollo",
          translations: { en: "Development" },
          collapsed: true,
          items: [
            "desarrollo/contribuir",
            "desarrollo/arquitectura",
            "desarrollo/tests-y-ci",
            "desarrollo/releases",
            "desarrollo/puente-de-cookies",
          ],
        },
        "changelog",
      ],
    }),
  ],
});
