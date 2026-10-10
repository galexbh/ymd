// ESLint flat config: typescript-eslint + react-hooks + react-refresh.
import js from "@eslint/js";
import globals from "globals";
import reactHooks from "eslint-plugin-react-hooks";
import reactRefresh from "eslint-plugin-react-refresh";
import tseslint from "typescript-eslint";

export default tseslint.config(
  {
    ignores: [
      "dist",
      "dist-ssr",
      "coverage",
      "playwright-report",
      "test-results",
      "src-tauri/target",
      ".claude",
      "src-tauri/gen",
      "node_modules",
      ".impeccable",
      "extension/dist",
    ],
  },
  {
    files: ["**/*.{ts,tsx}"],
    extends: [js.configs.recommended, ...tseslint.configs.recommended],
    languageOptions: {
      ecmaVersion: 2022,
      globals: globals.browser,
    },
    plugins: {
      "react-hooks": reactHooks,
      "react-refresh": reactRefresh,
    },
    rules: {
      ...reactHooks.configs.recommended.rules,
      "react-refresh/only-export-components": ["warn", { allowConstantExport: true }],
      "@typescript-eslint/no-unused-vars": [
        "error",
        { argsIgnorePattern: "^_", varsIgnorePattern: "^_", caughtErrors: "none" },
      ],
      "@typescript-eslint/consistent-type-imports": ["error", { fixStyle: "inline-type-imports" }],
      "no-console": ["warn", { allow: ["warn", "error", "info"] }],
    },
  },
  {
    // Node-side tooling and tests.
    files: [
      "*.config.{js,ts}",
      "e2e/**/*.ts",
      "src/test/**/*.ts",
      "src/**/__tests__/**/*.{ts,tsx}",
      "src/**/*.test.{ts,tsx}",
      // ymd Cookies extension (extension/): its tooling, fake chrome and tests.
      "extension/*.config.ts",
      "extension/e2e/**/*.ts",
      "extension/src/test/**/*.ts",
      "extension/src/**/__tests__/**/*.ts",
    ],
    languageOptions: { globals: { ...globals.node, ...globals.browser } },
    rules: {
      "react-refresh/only-export-components": "off",
      // Playwright fixtures use a parameter named `use`, which is not a React hook.
      "react-hooks/rules-of-hooks": "off",
    },
  },
  {
    files: ["**/*.js", "extension/scripts/**/*.mjs", "extension/e2e/**/*.mjs"],
    ignores: ["public/**"],
    extends: [js.configs.recommended],
    languageOptions: { globals: globals.node, sourceType: "module" },
  },
  {
    // Classic browser script loaded before the bundle (theme boot).
    files: ["public/**/*.js"],
    extends: [js.configs.recommended],
    languageOptions: { globals: globals.browser, sourceType: "script" },
    rules: { "no-unused-vars": ["error", { caughtErrors: "none" }] },
  },
  {
    // Primitive modules export small helpers next to components on purpose.
    files: ["src/ui/**/*.tsx"],
    rules: { "react-refresh/only-export-components": "off" },
  },
);
