// Prints the CHANGELOG.md section for a version (used as the GitHub release body).
// Usage: node scripts/release-notes.mjs v0.2.0   (a leading "v" is optional)
import { readFileSync } from "node:fs";

export function releaseNotes(changelog, version) {
  const v = version.replace(/^v/, "");
  const lines = changelog.replace(/\r\n/g, "\n").split("\n");
  const start = lines.findIndex((l) => l.startsWith(`## [${v}]`));
  if (start < 0) throw new Error(`CHANGELOG.md has no section for ${v}`);
  const rest = lines.slice(start + 1);
  const end = rest.findIndex((l) => /^## \[/.test(l) || /^\[[^\]]+\]: /.test(l));
  return rest
    .slice(0, end < 0 ? undefined : end)
    .join("\n")
    .trim();
}

if (
  import.meta.url === `file://${process.argv[1]}` ||
  process.argv[1]?.endsWith("release-notes.mjs")
) {
  const version = process.argv[2];
  if (!version) {
    console.error("usage: node scripts/release-notes.mjs <version>");
    process.exit(2);
  }
  process.stdout.write(releaseNotes(readFileSync("CHANGELOG.md", "utf8"), version) + "\n");
}
