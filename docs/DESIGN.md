---
name: ymd
description: A desktop accession register for yt-dlp. Every download is filed with a number, a stamp, a date and a shelf.
colors:
  surface: "#eef1f2"
  surface-2: "#e1e6e8"
  surface-sunken: "#e5e9eb"
  surface-raised: "#f8fafa"
  surface-hover: "#e4e9eb"
  text: "#172024"
  text-muted: "#4b5a61"
  text-faint: "#6b7a81"
  text-disabled: "#8b989e"
  rule: "#c3ccd0"
  rule-strong: "#8e9ca3"
  rule-ledger: "#cdd6db"
  accent: "#5b3fc4"
  accent-hover: "#4f2eb3"
  accent-active: "#431aa2"
  accent-soft: "#e0dfff"
  on-accent: "#ffffff"
  danger: "#a8281f"
  danger-hover: "#93190f"
  danger-soft: "#f5dcd8"
  on-danger: "#ffffff"
  warning: "#7a5300"
  warning-soft: "#f2e4c7"
  pencil: "#6b7a81"
  dark-surface: "#1b2427"
  dark-surface-2: "#151d20"
  dark-surface-sunken: "#131a1d"
  dark-surface-raised: "#222c30"
  dark-surface-hover: "#253035"
  dark-text: "#e2e8e9"
  dark-text-muted: "#9eacb1"
  dark-text-faint: "#7f8f95"
  dark-text-disabled: "#5e6d73"
  dark-rule: "#2f3c42"
  dark-rule-strong: "#4a5a62"
  dark-rule-ledger: "#2a363b"
  dark-accent: "#a996ff"
  dark-accent-hover: "#b8abff"
  dark-accent-active: "#c7bfff"
  dark-accent-soft: "#312c4b"
  dark-on-accent: "#11171a"
  dark-danger: "#f2877a"
  dark-danger-hover: "#ff9c8f"
  dark-danger-soft: "#42272a"
  dark-on-danger: "#11171a"
  dark-warning: "#d9b25e"
  dark-warning-soft: "#3a3020"
  dark-pencil: "#7f8f95"
  brand-violet: "#6b3fa0"
typography:
  headline:
    fontFamily: "Segoe UI Variable Text, Segoe UI Variable, Segoe UI, -apple-system, BlinkMacSystemFont, system-ui, Ubuntu, Cantarell, Noto Sans, Helvetica Neue, Arial, sans-serif"
    fontSize: "1.512rem"
    fontWeight: 600
    lineHeight: 1.2
    letterSpacing: "-0.01em"
  title:
    fontFamily: "Segoe UI Variable Text, Segoe UI Variable, Segoe UI, -apple-system, BlinkMacSystemFont, system-ui, Ubuntu, Cantarell, Noto Sans, Helvetica Neue, Arial, sans-serif"
    fontSize: "1.26rem"
    fontWeight: 600
    lineHeight: 1.2
  title-sm:
    fontFamily: "Segoe UI Variable Text, Segoe UI Variable, Segoe UI, -apple-system, BlinkMacSystemFont, system-ui, Ubuntu, Cantarell, Noto Sans, Helvetica Neue, Arial, sans-serif"
    fontSize: "1.05rem"
    fontWeight: 600
    lineHeight: 1.2
  body:
    fontFamily: "Segoe UI Variable Text, Segoe UI Variable, Segoe UI, -apple-system, BlinkMacSystemFont, system-ui, Ubuntu, Cantarell, Noto Sans, Helvetica Neue, Arial, sans-serif"
    fontSize: "0.875rem"
    fontWeight: 400
    lineHeight: 1.45
  body-sm:
    fontFamily: "Segoe UI Variable Text, Segoe UI Variable, Segoe UI, -apple-system, BlinkMacSystemFont, system-ui, Ubuntu, Cantarell, Noto Sans, Helvetica Neue, Arial, sans-serif"
    fontSize: "0.8125rem"
    fontWeight: 400
    lineHeight: 1.45
  label-section:
    fontFamily: "Segoe UI Variable Text, Segoe UI Variable, Segoe UI, -apple-system, BlinkMacSystemFont, system-ui, Ubuntu, Cantarell, Noto Sans, Helvetica Neue, Arial, sans-serif"
    fontSize: "0.75rem"
    fontWeight: 600
    lineHeight: 1.2
    letterSpacing: "0.09em"
  label:
    fontFamily: "Segoe UI Variable Text, Segoe UI Variable, Segoe UI, -apple-system, BlinkMacSystemFont, system-ui, Ubuntu, Cantarell, Noto Sans, Helvetica Neue, Arial, sans-serif"
    fontSize: "0.6875rem"
    fontWeight: 600
    lineHeight: 1.2
    letterSpacing: "0.09em"
  stamp:
    fontFamily: "Segoe UI Variable Text, Segoe UI Variable, Segoe UI, -apple-system, BlinkMacSystemFont, system-ui, Ubuntu, Cantarell, Noto Sans, Helvetica Neue, Arial, sans-serif"
    fontSize: "0.6875rem"
    fontWeight: 700
    lineHeight: 1
    letterSpacing: "0.14em"
  figure:
    fontFamily: "Cascadia Mono, SF Mono, ui-monospace, Menlo, Consolas, Ubuntu Mono, DejaVu Sans Mono, Liberation Mono, monospace"
    fontSize: "0.875rem"
    fontWeight: 400
    lineHeight: 1.45
    letterSpacing: "0"
    fontFeature: "\"tnum\" 1"
rounded:
  sm: "2px"
  md: "4px"
  lg: "6px"
  stamp: "2px"
  full: "1000px"
spacing:
  "1": "4px"
  "2": "8px"
  "3": "12px"
  "4": "16px"
  "5": "20px"
  "6": "24px"
  "8": "32px"
  "10": "40px"
  "12": "48px"
components:
  button-primary:
    backgroundColor: "{colors.accent}"
    textColor: "{colors.on-accent}"
    rounded: "{rounded.md}"
    padding: "0 16px"
    height: "36px"
  button-primary-hover:
    backgroundColor: "{colors.accent-hover}"
  button-primary-active:
    backgroundColor: "{colors.accent-active}"
  button-secondary:
    backgroundColor: "{colors.surface-raised}"
    textColor: "{colors.text}"
    rounded: "{rounded.md}"
    padding: "0 16px"
    height: "36px"
  button-secondary-hover:
    backgroundColor: "{colors.surface-hover}"
  button-ghost:
    backgroundColor: "transparent"
    textColor: "{colors.text}"
    rounded: "{rounded.md}"
    padding: "0 16px"
    height: "36px"
  button-ghost-hover:
    backgroundColor: "{colors.surface-hover}"
  button-danger:
    backgroundColor: "{colors.danger}"
    textColor: "{colors.on-danger}"
    rounded: "{rounded.md}"
    padding: "0 16px"
    height: "36px"
  button-danger-hover:
    backgroundColor: "{colors.danger-hover}"
  button-disabled:
    backgroundColor: "{colors.surface-sunken}"
    textColor: "{colors.text-disabled}"
  button-sm:
    padding: "0 12px"
    height: "28px"
  button-lg:
    padding: "0 20px"
    height: "44px"
  input:
    backgroundColor: "{colors.surface-raised}"
    textColor: "{colors.text}"
    rounded: "{rounded.md}"
    padding: "0 12px"
    height: "36px"
  stamp-queued:
    textColor: "{colors.pencil}"
    typography: "{typography.stamp}"
    rounded: "{rounded.stamp}"
  stamp-in-process:
    textColor: "{colors.accent}"
    typography: "{typography.stamp}"
    rounded: "{rounded.stamp}"
    padding: "0.32em 0.6em 0.26em"
  stamp-archived:
    backgroundColor: "{colors.accent}"
    textColor: "{colors.on-accent}"
    typography: "{typography.stamp}"
    rounded: "{rounded.stamp}"
  stamp-failed:
    textColor: "{colors.danger}"
    typography: "{typography.stamp}"
    rounded: "{rounded.stamp}"
  stamp-canceled:
    textColor: "{colors.text-faint}"
    typography: "{typography.stamp}"
    rounded: "{rounded.stamp}"
  tag:
    textColor: "{colors.text-muted}"
    rounded: "{rounded.sm}"
    padding: "0 8px"
    height: "22px"
  tag-accent:
    backgroundColor: "{colors.accent-soft}"
    textColor: "{colors.text}"
  tag-warning:
    backgroundColor: "{colors.warning-soft}"
    textColor: "{colors.text}"
  tag-danger:
    backgroundColor: "{colors.danger-soft}"
    textColor: "{colors.text}"
  ledger-head:
    backgroundColor: "{colors.surface}"
    textColor: "{colors.text-muted}"
    typography: "{typography.label}"
    height: "32px"
  ledger-row:
    textColor: "{colors.text}"
    padding: "4px 12px"
    height: "40px"
  ledger-row-hover:
    backgroundColor: "{colors.surface-hover}"
  ledger-row-selected:
    backgroundColor: "{colors.accent-soft}"
  shelf-rail:
    backgroundColor: "{colors.surface-2}"
    width: "200px"
  shelf-item:
    textColor: "{colors.text-muted}"
    rounded: "{rounded.sm}"
    padding: "0 12px"
    height: "40px"
  shelf-item-current:
    backgroundColor: "{colors.accent-soft}"
    textColor: "{colors.text}"
  segment-selected:
    backgroundColor: "{colors.accent-soft}"
    textColor: "{colors.text}"
  accession-card:
    backgroundColor: "{colors.surface-raised}"
    textColor: "{colors.text}"
    rounded: "{rounded.md}"
    padding: "16px"
  dialog:
    backgroundColor: "{colors.surface-raised}"
    textColor: "{colors.text}"
    rounded: "{rounded.lg}"
    width: "32rem"
---

# Design System: ymd

## Overview

**Creative North Star: "The Accession Register"**

ymd treats every download as an item entering the user's own archive. The link is handed over at a counter, gets an accession card with a number, and is filed into a ruled ledger. Its status is a rubber stamp, its progress is an inked span drawn to scale, and the catalog is where it gets retrieved later. The grounds are archival materials: grey-white archival board in light mode and Hollinger archival-box slate in dark mode. One ink, violet date-stamp ink, does all the speaking. Library-tape red appears only when something failed.

The density is that of a working register. Rows are 40px, labels are small tracked capitals like the column heads of a printed ledger, and every figure (accession numbers, sizes, speeds, ETAs, durations, percents, dates) is set in tabular system mono. Structure comes from hairline rules. Shadow is almost absent, and depth comes from two neutral layers (the board and the shelf rail) plus a slightly raised card. Motion only marks state changes. The one flourish is the ARCHIVADO stamp striking onto a row at the moment a download completes.

The system rejects the category default: a dark card grid with a red accent. Red is never decoration, never brand, and never a progress color.

**Key Characteristics:**
- A ruled ledger, not a card grid: rows separated by blue-grey hairlines, with figures in tabular mono and aligned to the end of the cell.
- One violet ink for primary actions, stamps, progress ink, focus and the current place. Red only for failure.
- Status is a stamp vocabulary (pencilled, outlined, struck solid, failed, canceled), not coloured dots or pills.
- Progress is an exact span: the inked length is the real share, with no easing and no rounding.
- Every item carries a six-digit accession number.
- The user controls theme, accent, density, corner radius and text size. The system stays legible under every combination.

## Colors

The palette is cool archival greys with one violet ink. Each theme defines the same set of semantic tokens, and components read only those tokens.

### Primary
- **Date-Stamp Violet** (light `accent`, dark `dark-accent`): the only accent. It is used for the primary button ("Ingresar"), every stamp in process, the solid ARCHIVADO impression, the inked part of a ledger span, the focus ring, the caret, the selected segment's border and icon, the current shelf item's icon, the queue count badge outline, and links. Hover and active steps (`accent-hover`, `accent-active`) move further from the surface. **Violet Wash** (`accent-soft`) is the selection ground for selected rows, the current shelf item, selected segments and text selection. **On-Accent** is white in light mode and near-black slate in dark mode.
- **Brand Violet** (`brand-violet`): the fixed ink of the app icon, favicon and installer art, and the fallback fill of the logotype mark. Inside the running app the mark follows the live `accent`, so this value never appears as UI color.

### Neutral
- **Archival Board** (`surface`) / **Archival-Box Slate** (`dark-surface`): the page ground.
- **Shelf Grey** (`surface-2` / `dark-surface-2`): the second layer, used for the shelf rail and side panels. It is darker than the board in both themes.
- **Raised Board** (`surface-raised` / `dark-surface-raised`): the accession card, inputs, secondary buttons, dialogs, tooltips and notices.
- **Sunken Board** (`surface-sunken`): segmented-control troughs, switch tracks, disabled buttons and pressed states. **Hover Board** (`surface-hover`) is the hover fill for rows, shelf items and ghost buttons.
- **Ledger Ink** (`text`), **Faded Ink** (`text-muted`), **Faint Ink** (`text-faint`), **Disabled Ink** (`text-disabled`): the text ramp. Muted text carries descriptions, units, column heads and the accession prefix.
- **Pencil** (`pencil`): drafts that are not yet stamped, such as the queued stamp, the dotted unknown-total span and the empty stage marks.
- **Rules**: `rule` for section and panel borders, `rule-strong` for control borders, ledger head underlines, span baselines and stamp-like doubles, and `rule-ledger` (the quietest) between ledger rows.

### Status
- **Library-Tape Red** (`danger`, `danger-soft`, `on-danger`): the failed stamp, failed span ink, failed stage mark, the error row's 1px leading edge, error notices, field errors, the shelf failure flag, and the one irreversible confirmation (clearing the catalog).
- **Ochre** (`warning`, `warning-soft`): caution only, for example "update available", "browser is running" and cookie warnings. It appears as tags and notices and is never used as an action color.
- There is no green. `success` resolves to the accent, so a finished download reads as archived (violet), not as "green OK".

### Named Rules
**The One Ink Rule.** Violet is the only accent. It marks action, stamp, progress, focus and current place. A second hue never takes on any of those jobs.

**The Library-Tape Rule.** Red means something failed or is about to be destroyed irreversibly. It is never used for brand, emphasis, progress or decoration.

**The Clamped Ink Rule.** A user-chosen accent is never shown raw. It is derived per theme and moved in OKLCH lightness until it reaches 4.5:1 against every surface (board, shelf, sunken, raised and its own wash) and against its on-accent ink. When it had to move, the Appearance screen says so.

### User accent derivation
The accent picker offers eight curated inks (violet, indigo, teal, green, ochre, rust, magenta, graphite), each with a hand-tuned light and dark tone. Any other hex goes through this derivation:
1. Convert to OKLCH. Reduce chroma (keeping L and H) until the color fits in sRGB.
2. Build the wash: L 0.915 with C ≤ 0.045 in light mode, or L 0.315 with C ≤ 0.055 in dark mode, keeping the same hue.
3. Walk lightness away from the surface (darker on light, lighter on dark) in 0.005 steps until the tone passes AA (4.5:1) against all five grounds and against its on-accent ink. If it never passes, fall back to a near-black (L 0.2) or near-white (L 0.95) neutral.
4. On-accent is white or `#11171a`, whichever contrasts more. The preference is white in light mode and slate in dark mode.
5. Hover and active are ±0.05 and ±0.10 L from the tone. They step toward contrast first and away from it only when that fails AA.
6. Focus equals the accent. Report `adjusted` when the tone differs from the request.
The derived variables (`--accent`, `--accent-hover`, `--accent-active`, `--accent-soft`, `--on-accent`, `--focus`) are cached for both themes before first paint.

## Typography

**Body Font:** System sans: Segoe UI Variable Text, then the platform UI face, then Arial.
**Label/Mono Font:** System mono: Cascadia Mono, SF Mono, ui-monospace, then Consolas and the other platform monos.

**Character:** The app runs offline, so it uses no webfonts. The sans is the quiet clerk's hand. The mono, with tabular numerals and a slashed zero, is the numbering machine, and every figure goes through it.

### Hierarchy
The scale has a 1.2 ratio around a 14px body. Every step is multiplied by the user's text scale (0.875 to 1.25), and control and row heights follow it.
- **Headline** (600, 1.512rem, 1.2, -0.01em): the screen title, which sits above a 2px `rule-strong` underline. There is one per screen.
- **Title** (600, 1.26rem, 1.2): the item title on the accession card.
- **Title-sm** (600, 1.05rem, 1.2): dialog titles, empty-state titles and the next accession number on the card.
- **Body** (400, 0.875rem, 1.45): the default text and ledger cell text. Prose and descriptions are capped at 68ch.
- **Body-sm** (400, 0.8125rem, 1.45): field labels (weight 500), hints, tooltips and secondary buttons at the small size.
- **Label-section** (600, 0.75rem, 0.09em, uppercase): section heads above a 1px rule, for example "Registro de esta sesión".
- **Label** (600, 0.6875rem, 0.09em, uppercase): ledger column heads, fact labels on the accession card (Duración, Sitio, Estante) and the version labels in the rail footer. These are register headings that name a column or a value. They never introduce a heading.
- **Stamp** (700, 0.6875rem, line-height 1, 0.14em, uppercase): stamp words only.
- **Figure** (mono, tabular-nums, slashed zero, tracking 0): accession numbers, sizes, speeds, ETAs, durations, percents, versions, paths and the stamp date. Units sit at 0.92em in faded ink.

### Named Rules
**The Numbering Machine Rule.** Every figure is set in tabular system mono with a slashed zero. In a ledger column, figures are aligned to the end of the cell. A figure set in the sans is a bug.

**The No Display Tier Rule.** The largest type is the 1.512rem screen headline. The system sans is a text face here and is never enlarged into a display or hero size.

### Accession number format
- Six zero-padded digits after a locale prefix, joined by a non-breaking space: `N.º 000123` (es) and `No. 000123` (en). The prefix is set in faded ink and the digits in ledger ink.
- In a ledger whose column head already says "N.º", only the digits are inked. The prefix stays in the markup for screen readers.
- A row with no number shows an em dash.
- Stamp filing dates use `DD MON YYYY` with non-breaking spaces and an uppercase month with no period, for example `08 OCT 2026`. They are set in mono at 0.86em, weight 600, 0.06em.

## Layout

- **Shell:** a two-column grid. The shelf rail is 12.5rem (200px) on `surface-2`, separated by a 1px `rule`. At window widths of 1000px and below it collapses to a 3.75rem icon rail: the logotype is replaced by the accent isotype, labels become visually hidden, and the count badge moves to the icon corner.
- **Screens:** data screens (Recibir, Registro, Catálogo, Dependencias) are fluid and use the full window width, with the title column absorbing extra space. Prose keeps a 68ch measure and settings forms a 52rem column. Padding is 24px top, 32px sides and 48px bottom, with 32px between sections. At 1000px and below, padding drops to 16/20/40px and the section gap to 24px. No ledger may scroll sideways at any width from 880px to 2560px (e2e `layout.spec.ts`); tooltips on row-end controls use `align="end"`, and hidden tooltips are `display: none` so they never create overflow.
- **Receive (the first viewport):** the counter strip (URL field, Video/Audio segments, preset select, primary button) sits on top, the accession card below it, then the session ledger. The strip and the card respond to their own width with container queries (strip at 820px and 1000px, card stacks at 560px). The jobs ledger drops columns at 1200px, 980px and 800px of its container. On short windows (700px tall or less) the card compacts to an 8.5rem thumbnail so the ledger stays in the first viewport.
- **Spacing:** a 4px grid (`space-1` to `space-12`). All spacing is multiplied by density: comfortable is 1 and compact is 0.78. Control heights are 28/36/44px and the row height is 40px. Both are multiplied by density and by text scale.
- **Playlist picker:** a grid of fixed 6.75rem columns, the footprint of a md stamp, so entries file like a sheet of stamps.

## Elevation & Depth

The system is flat and ruled. Depth comes from tone: the board, a darker shelf layer, and a raised board for the things you hand over or type into. Hairline rules carry the structure. There are only two shadows.

### Shadow Vocabulary
- **Raise** (`box-shadow: 0 1px 2px rgb(23 32 36 / 0.1)`; dark `0 1px 2px rgb(0 0 0 / 0.3)`): the accession card only. It is the item lying on the counter.
- **Overlay** (`box-shadow: 0 12px 32px -8px rgb(23 32 36 / 0.28), 0 2px 6px rgb(23 32 36 / 0.12)`; dark `0 16px 40px -8px rgb(0 0 0 / 0.55), 0 2px 8px rgb(0 0 0 / 0.3)`): dialogs, tooltips and toasts, which float above the page. Dialogs sit over a slate scrim (`rgb(23 32 36 / 0.42)` light, `rgb(8 12 14 / 0.6)` dark).

### Named Rules
**The Ruled-Not-Lifted Rule.** Separation comes from hairlines (`rule`, `rule-strong`, `rule-ledger`) and the two neutral layers. A third shadow, or a shadow on a ledger row, panel or button, breaks the register.

## Shapes

- **Radius modes:** the user chooses sharp (base 0px), soft (base 4px, the default, used for the frontmatter values) or round (base 8px). Every radius derives from the base: `sm` = 0.5×, `md` = 1×, `lg` = 1.5×, `full` = 250×. In sharp mode even switches become square.
- **Assignment:** `md` for buttons, fields, the card, panels, notices and segmented controls. `sm` for tags, kbd keys, shelf items, tooltips and the count badge. `lg` for dialogs. `full` for switch tracks and knobs and the failure flag dot.
- **Stamp corner:** stamps and stage marks use `min(base, 2px)` in every mode. A rubber stamp is a physical mark and never becomes a pill.
- **Rules:** 1px hairlines everywhere. Section heads and panels use `rule`, controls and the ledger head use `rule-strong`, and ledger rows use `rule-ledger`. Two heavier rules carry meaning: the 2px `rule-strong` under a screen headline, and the 3px double rule, which marks the stamp border and the underline of the accession card's number line.
- **Empty states** use a 1px dashed `rule-strong` frame, the "space not yet filled" of the register.

## Components

### Buttons
Ink on board: plain, solid and quiet.
- **Shape:** gently squared (`rounded.md`), 36px tall, 16px side padding, 600 weight, 8px gap to an icon.
- **Primary:** solid violet with on-accent text, for example "Ingresar" and "Archivar". Use at most one per view.
- **Secondary:** raised board with a `rule-strong` border. Hover moves to the hover board and a `text-faint` border, and pressed sinks to `surface-sunken`. Inside an error notice, the main action is secondary, never violet.
- **Ghost:** transparent until hover. Used for toolbar and row actions.
- **Danger:** solid red, only in the irreversible confirmation dialog.
- **States:** colour transitions over 150ms `ease-standard`. Disabled is a sunken board with disabled ink. Loading keeps the variant colour and shows a 900ms linear spinner. Focus is a 2px `focus` outline with a 2px offset.
- **Sizes:** sm is 28px with 12px padding, lg is 44px with 20px padding. Icon-only buttons are square at the control height.

### Stamps (signature)
The status mark for jobs and dependencies. Every stamp shares the same shape: a 3px double border in the stamp ink, the `stamp` type role, a 6.75em minimum width (md) and the 2px stamp corner.

| State | Stage | Treatment |
|---|---|---|
| Pencilled | queued | 1px dashed `pencil` border with a 2px margin, so the footprint matches a 3px stamp. Weight 600. Not yet inked. |
| In process | downloading, merging, postprocessing | Violet double outline, set square. |
| Archived | done | Solid violet impression clipped inside the outer rule of the double border, on-accent text, tilted -1.2°. It may carry the filing date beneath the word (`08 OCT 2026`). |
| Failed | error | Red double outline, set square. |
| Canceled | canceled | `text-faint` double outline with the word struck through (1.5px). |

- **Sizes:** sm (tighter padding, no minimum width), md, and lg (`body-sm` size, 4px double).
- **The strike:** when a mounted stamp changes to done, it strikes once over 180ms `ease-out`, from scale 1.12 and 2.5° extra rotation at opacity 0 down to rest. A row that mounts already archived does not strike. Under reduced motion there is no animation.
- A visually hidden prefix tells screen readers that the word is a status.

### Ledger
The register itself, used for the session queue, the catalog and dependencies.
- A table with fixed layout. The sticky head is 32px tall (0.8 × row height) on `surface`, in the `label` role, set in faded ink and bottom-aligned above a 1px `rule-strong`.
- Rows are 40px with 4px/12px padding and a 1px `rule-ledger` between them. Numeric cells are aligned to the end of the cell in mono.
- Hover uses the hover board (150ms). Selected uses the violet wash. Focus is a 2px inset outline. A failed row has a 1px red line on its leading edge, and its error notice opens beneath it.
- Columns on Receive: N.º, title, format (mono tag), size, progress span plus percent, speed, ETA, stamp, then row actions.

### Ledger span (signature)
Progress as a ruled line drawn to scale.
- A 12px box with a 1px `rule-strong` baseline, 4px ticks at every quarter, and a closing tick at 100%.
- The ink is a 3px violet bar whose width is exactly value ÷ max, clamped to 0–1, with no easing, no rounding and no transition. A 1.5×9px pen mark stands at its leading edge, hidden at 0%.
- When the total is unknown, the span shows a dotted pencil line and no fake motion. Failed ink is red. Canceled ink drops to a 1px faint line. Merging, postprocessing and done always show a full span.
- The thick variant (14px box, 5px ink) is for dependency installs and has exact byte figures above it: "12,3 MiB de 40 MiB · 31 %".
- **Stage line:** the four stages (queued, downloading, merging, archived) sit on one baseline with 9px square marks. Reached marks are filled with ink, the current mark gets a 2px ink ring, and a failed mark is red.

**The Exact Span Rule.** The inked length always equals the real share. Spans are never animated, smoothed or estimated. An unknown total gets the dotted pencil line.

### Accession card
The item on the counter.
- Raised board with a 1px `rule-strong` border, `rounded.md`, the raise shadow and 16px padding. The thumbnail column is 11–17rem wide next to the body.
- The head line pairs a small label ("Se archivará como") with the next accession number at `title-sm` size, above a 3px double `rule-strong`. The item title is next, then the uploader in faded ink. A facts row (Duración, Mejor calidad, Sitio, Preajuste, Estante) sits above a 1px `rule-ledger`, with `label` heads and figure or path values.

### Inputs / Fields
- **Style:** raised board, 1px `rule-strong` border, `rounded.md`, 36px tall, 12px padding. The label is `body-sm` at weight 500 and the hint is `body-sm` in faded ink.
- **Hover:** the border moves to `text-faint`. **Focus:** the border and a 2px outline both take the focus ink.
- **Error:** the message is in red with a leading icon. Paths are set in mono.

### Segmented control and switch
- **Segmented:** a sunken trough with a `rule-strong` border. The selected segment gets the violet wash, a violet border and a violet icon.
- **Switch:** the track uses the `full` radius on the sunken board. When on, it fills with the accent.

### Tags
- 22px tall, `rounded.sm`, 1px `rule-strong` border, faded ink, 0.75rem at weight 500. The mono variant is for formats ("MP3 · 320K"). Tonal variants (accent, warning, danger) use their wash fill, a border in the tone and ledger ink.

### Navigation (shelf rail)
- The logotype sits in a 64px brand row. Shelf items are 40px tall with a 1px `rule-ledger` between them. Items use faded ink at weight 500. The current item uses the violet wash, ledger ink at weight 600 and a violet icon. Hover uses the hover board.
- The count badge is outlined in violet. Failures get a small red flag dot. The footer lists the yt-dlp and JS runtime versions in mono under `label` heads, plus the keyboard-shortcuts button.

### Notices, dialogs, tooltips
- **Notice:** raised board, `rounded.md` and an 18px tone icon. The error tone uses the red wash and a red border. It always states the next step, may show the raw yt-dlp line in mono as detail, and offers a secondary action plus a ghost action.
- **Dialog:** raised board, `rounded.lg` and the overlay shadow. It rises 6px over 200ms `ease-out`. Header and footer are divided by `rule`, and the footer sits on the board.
- **Tooltip:** raised board, `rounded.sm` and the overlay shadow. It appears after 300ms on hover, or immediately on focus.

### Iconography
- Lucide icons only, at one stroke weight (1.75), 16px by default and 18px in notices. Icons are decorative (`aria-hidden`), so the control carries the label. They take the colour of their text, and violet only when their control is current or selected.

### Brand mark
- **Isotype:** a double-ruled accession stamp holding a lowercase y whose tail cuts through both rules. There are three drawings: pixel-hinted 16px and 24px grids rendered with crisp edges, and the 64 master for anything larger. It inherits `currentColor` and appears in accent violet in the collapsed rail.
- **Logotype:** the mark in the live accent, followed by the "ymd" wordmark in ledger ink, with a 176:64 width-to-height ratio. It appears in the full rail at the top left.
- **App icon, favicon and installer art:** the mark in Brand Violet on a pale paper tile.
- All brand geometry is generated by `.impeccable/brand/scripts/build-brand.mjs`. To change it, edit the script, not the SVGs or `Logo.tsx`.

### Motion
State changes only: 150ms for hover and colour, 200ms for dialog rise, 250ms as the slow step, and 180ms for the stamp strike. Easing is `cubic-bezier(0.16, 1, 0.3, 1)` (out) and `cubic-bezier(0.2, 0, 0, 1)` (standard). The skeleton lines breathe in opacity over 1.6s. Under reduced motion, transitions are 0s and animations stop, so progress ink never freezes partway.

## Do's and Don'ts

### Do:
- **Do** give every downloaded item an accession number (`N.º 000123`, six digits) and show it wherever the item appears.
- **Do** set every figure in tabular system mono with a slashed zero, aligned to the end of the cell in ledger columns.
- **Do** report status with the stamp vocabulary: pencilled for queued, violet outline in process, solid tilted violet for archived, red outline for failed, faint struck-through for canceled.
- **Do** draw progress as an exact ledger span. Use the dotted pencil line when the total is unknown.
- **Do** read only semantic tokens, and define every token in both themes.
- **Do** derive user accents through the AA clamp, and tell the user when their colour was moved.
- **Do** separate content with hairline rules (`rule-ledger` between rows, `rule-strong` under heads).
- **Do** let density, text scale and radius mode flow through the token multipliers instead of fixed pixel values.
- **Do** pair every error with the next step the user can take.

### Don't:
- **Don't** use a second accent hue, a green "success", or red for anything other than failure or irreversible destruction.
- **Don't** build card grids for items. Items live in the ledger, and the only card is the accession card on the counter.
- **Don't** animate, ease or estimate a progress span, and don't use an indeterminate shimmer.
- **Don't** tilt any stamp except the archived impression, and don't round a stamp past 2px.
- **Don't** add shadows beyond raise (the accession card) and overlay (floating layers).
- **Don't** introduce webfonts or a display size above the 1.512rem headline.
- **Don't** use icons from any set other than Lucide at stroke 1.75, and don't use emoji or text glyphs as icons.
- **Don't** use YouTube's logo or any third-party mark, and don't hand-edit the generated brand files.
