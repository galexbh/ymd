import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { releaseNotes } from "../release-notes.mjs";

const sample = `# Changelog

## [0.3.0] - 2026-11-01

### Novedades
- Algo nuevo.

## [0.2.0] - 2026-10-10

Primera versión.

### Novedades
- Descargas.

[0.3.0]: https://example.com/0.3.0
[0.2.0]: https://example.com/0.2.0
`;

describe("release notes from CHANGELOG.md", () => {
  it("returns only the requested section, with or without a leading v", () => {
    expect(releaseNotes(sample, "v0.3.0")).toBe("### Novedades\n- Algo nuevo.");
    expect(releaseNotes(sample, "0.2.0")).toBe("Primera versión.\n\n### Novedades\n- Descargas.");
  });

  it("fails loudly for a missing version", () => {
    expect(() => releaseNotes(sample, "9.9.9")).toThrow(/no section/);
  });

  it("the real changelog has notes for the app's current version", () => {
    const pkg = JSON.parse(readFileSync("package.json", "utf8"));
    const notes = releaseNotes(readFileSync("CHANGELOG.md", "utf8"), pkg.version);
    expect(notes.length).toBeGreaterThan(200);
    expect(notes).toContain("### Novedades");
  });
});
