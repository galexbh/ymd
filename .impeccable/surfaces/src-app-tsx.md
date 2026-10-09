---
version: 1
slug: "src-app-tsx"
primary_target: "src/App.tsx"
related_targets: ["src"]
---

## Scope

ymd desktop app shell and all of its screens (Receive, Ledger/queue, Catalog/history, Dependencies, Settings, first run). Visitor mode: **Operate**.

## Audience and task

A person saving video or music from the web. They paste a link, pick video or audio and a preset, and queue it. They watch progress, then find the file later. Content is real yt-dlp data: titles, thumbnails, sizes, speeds and errors. Constraints: Tauri webview, offline (no web fonts), es/en, light and dark themes with a user accent.

## Direction contract

THESIS: Every download is an accession into the user's own archive, with a number, a stamp, a date and a shelf location. It refuses the category default: a dark card grid with a red accent.

OWN-WORLD:
- Grounds are Hollinger archival-box slate (dark) and grey-white archival board (light).
- The ledger is ruled with blue-grey hairlines.
- The single accent is violet date-stamp ink: primary action, stamps and focus. Library-tape red is reserved for failures.
- Text uses the system sans; every figure is set in tabular system mono.
- Status reads as rubber stamps.

STORY: The user hands a link over at the counter and sees its accession card, then files it. The ledger fills with exact inked spans. Later they retrieve the file from the catalog.

FIRST VIEWPORT:
- A shelf rail on the left, about 200px.
- Along the top, the counter strip: URL field, Video/Audio, preset, and the violet "Ingresar" button.
- Below it, the accession card.
- Below that, the ruled ledger: N.º, title, format, size, progress span, speed, ETA, stamp.

FORM: Archival accession register, my list #4, seed ea830a5c. Signature interaction: the ARCHIVADO stamp strikes onto the row on completion.

FINISH: unreviewed and undocumented is unfinished; this build ends with the finish review, the verdict, DESIGN.md, and every shipping raster carrying its provenance

## Raises carried from declined challengers

- Progress span length is exact: real bytes over the total, never a decorative bar (Labanotation).
- The playlist picker is a stamp-size thumbnail grid with accession codes; selected entries are circled in ink (doujin catalog).
- All figures are tabular mono in aligned columns (Datamatics).
- Job stages sit at a fixed scale on one baseline: queued, downloading, merging, archived (botanical folio).

## Unresolved

- The isotype is chosen from 3 proposals after the build starts.
