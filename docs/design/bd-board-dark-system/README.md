# bd board — dark design system

A dark, dense tool system for a local dependency-graph work board. One hue
family, one violet accent split into two contrast-safe tokens, and a type pair
where Geist Sans reads and Geist Mono registers.

## Product Overview

**bd-board** is a local desktop application that turns the `bd` CLI — a
dependency-graph issue tracker — into a board. It discovers several
repositories at once under `~/Code/*`, shells out to the local `bd` binary for
every read and write, and ships as both a browser build and a Tauri desktop
shell. The product is read-only by default: writes are gated behind the
`BD_BOARD_ALLOW_WRITE` environment flag, and the interface states which mode it
is in at all times.

It provides four primary surfaces. The **board** groups work items — *beads* —
into swimlanes by epic, priority or status across four status columns, with
quick filters for ready / blocked / assigned-to-me and a `/` search. The
**bead detail sheet** opens over the board with content on the left and
metadata on the right, and includes subtasks, dependency edges, comments and a
delete flow that requires typing the bead id. The **projects dashboard**
aggregates every discovered repository into stat tiles, stacked status bars and
completion rings. The **knowledge detail sheet** reuses the same object surface
for a knowledge entry — a bead comment whose text opens with one of seven
recognised prefixes.

The audience is a single developer and their coding agents; the assignee list
contains a person, `claude-agent` and `codex-cli`. That is why the app has
monograms instead of photographs, and why every mutating surface previews the
`bd` command it is about to run.

## Source Evidence

Derived from the Open Design project **"Redesign dark do bd-board"**
(`0aedf231-ee41-492a-b0c0-8c6362012b3b`), whose linked repository is
`bd-board`. Seven files were copied in as evidence and are preserved
here unmodified:

| File | What it proves |
| --- | --- |
| [`assets/bd-dark.css`](assets/bd-dark.css) | Every token and component rule (1,525 lines) |
| [`assets/board-data.js`](assets/board-data.js) | Domain model, status mapping, taxonomy, icon set |
| [`board.html`](board.html) | Shell, swimlanes, filter bar, knowledge tab, keyboard model |
| [`bead-detail.html`](bead-detail.html) | Detail sheet, metadata rail, typed-confirmation delete |
| [`knowledge-detail.html`](knowledge-detail.html) | The same sheet applied to a second object type |
| [`projects.html`](projects.html) | Stat tiles, stacked bars, completion rings |
| [`index.html`](index.html) | The author's own rationale, and the contrast numbers |

Per-artifact provenance — including what the evidence does **not** contain —
is in [`context/provenance.md`](context/provenance.md); the original handoff is
in [`context/source-context.md`](context/source-context.md).

## The five decisions

1. **The accent is two tokens.** `--primary` (`oklch(0.54 0.19 268)`) fills;
   `--primary-text` (`oklch(0.72 0.16 268)`) writes. The origin repo used one
   token for both jobs and failed 4.5:1 in each — 4.34:1. Split, they clear
   5.15:1 and 6.59:1.
2. **Hover darkens.** Lightening the primary fill would drop white text to
   3.99:1, so hover goes to `L 0.47` and adds a ring. Contrast rises with the
   interaction, never falls.
3. **One hue family, six surfaces.** Every panel is a lightness step on
   `oklch(… 0.006 270)`, so stacked chrome reads as depth rather than as
   different materials. Outlines are inset rings, not borders.
4. **Mono is the machine register.** Bead ids, counts, durations, section
   eyebrows and `bd` commands are Geist Mono with tabular figures. Everything a
   person reads in sentences is Geist Sans.
5. **Density is the product.** 14px base, 12.75px card text, a 2px spacing
   scale topping out at 28px. This tool sits open next to an editor all day.

## Package Contents

| Path | Contents |
| --- | --- |
| [`DESIGN.md`](DESIGN.md) | The full specification — read before building |
| [`SKILL.md`](SKILL.md) | Agent-facing build instructions and hard rules |
| [`colors_and_type.css`](colors_and_type.css) | Color + typography tokens, plus a labelled sRGB fallback layer |
| [`tokens.css`](tokens.css) | Spacing, radius, elevation, layout and motion tokens |
| [`fonts/geist.css`](fonts/geist.css) | Typeface loading contract — Geist + Geist Mono, CDN, no binaries |
| `assets/bd-dark.css` | **Preserved source** — the runtime component stylesheet |
| `assets/board-data.js` | **Preserved source** — domain model, taxonomy, icon set |
| [`assets/icons/`](assets/icons/manifest.json) | 27 icons extracted as standalone SVGs + `manifest.json` |
| [`build/icons.js`](build/icons.js) | Runtime icon module — `bdIcon()`, `bdHydrateIcons()` |
| [`preview/`](preview/index.html) | Nine focused review cards + manifest |
| [`ui_kits/app/`](ui_kits/app/index.html) | Five working surfaces + `components/` partials |
| [`context/`](context/provenance.md) | Handoff note and per-artifact provenance |
| `board.html` · `bead-detail.html` · `knowledge-detail.html` · `projects.html` · `index.html` | **Preserved source screens**, unmodified |

### Preserved assets, fonts and build artifacts

- **`assets/`** holds the two preserved source files plus `assets/icons/` — 27
  SVGs generated mechanically from the icon map inside `board-data.js`. No icon
  was redrawn, added or removed.
- **`build/`** holds the runtime icon module lifted from the same map. There is
  no app icon, tray icon or favicon: none exist in the source evidence, and the
  project itself has an open bead (`bdb-p2m`) for that work.
- **`fonts/`** documents the exact Google Fonts request the four screens make.
  No font binaries were shipped in the evidence, so none are vendored.

## Preview Manifest

Nine focused review cards, each loading the preserved source files directly.
Open [`preview/index.html`](preview/index.html) for the linked manifest.

| Card | Inspect |
| --- | --- |
| [`preview/applied-surfaces.html`](preview/applied-surfaces.html) | **Start here** — all four source screens live in frames, plus the rationale page |
| [`preview/colors-primary.html`](preview/colors-primary.html) | Six surfaces, three text levels with contrast floors, the split accent |
| [`preview/colors-status.html`](preview/colors-status.html) | Four status hues and the seven-hue knowledge taxonomy |
| [`preview/typography-specimens.html`](preview/typography-specimens.html) | The Sans/Mono pair and the fourteen-step scale |
| [`preview/spacing-tokens.html`](preview/spacing-tokens.html) | The 2px scale, fixed structural measures, five breakpoints |
| [`preview/radius-shadows.html`](preview/radius-shadows.html) | Corner ladder, the two shadows, rest vs hover, motion durations |
| [`preview/components-buttons.html`](preview/components-buttons.html) | Every button variant across rest, hover, focus and disabled |
| [`preview/components-cards.html`](preview/components-cards.html) | Real bead cards and rows, rendered from the preserved dataset |
| [`preview/brand-assets.html`](preview/brand-assets.html) | The brand mark, all 27 extracted icons, the monogram rule |

## Reuse Workflow

1. **Review.** Open [`preview/index.html`](preview/index.html) and inspect
   `preview/applied-surfaces.html` first — it shows the system running, which
   is the ground truth everything else was measured against.
2. **Read.** Work through [`DESIGN.md`](DESIGN.md), then skim
   [`colors_and_type.css`](colors_and_type.css) and [`tokens.css`](tokens.css)
   for the token names.
3. **Copy a surface.** Open [`ui_kits/app/index.html`](ui_kits/app/index.html)
   and start from the closest working surface rather than a blank file. Delete
   the `kit-*` annotation blocks; keep the `<head>`.
4. **Load the right stylesheet.** For a bd-board screen, load the preserved
   `assets/bd-dark.css` — it already contains both token sets plus every
   component rule, so it cannot drift. For a different product, load the two
   token files instead.
5. **Verify.** Run the checklist at the end of [`SKILL.md`](SKILL.md) before
   calling it done.

### Loading the tokens

```html
<link rel="preconnect" href="https://fonts.googleapis.com" />
<link rel="preconnect" href="https://fonts.gstatic.com" crossorigin />
<link
  href="https://fonts.googleapis.com/css2?family=Geist:wght@300..700&family=Geist+Mono:wght@400..600&display=swap"
  rel="stylesheet"
/>
<link rel="stylesheet" href="colors_and_type.css" />
<link rel="stylesheet" href="tokens.css" />
```

### Loading the full component system

```html
<link rel="stylesheet" href="assets/bd-dark.css" />
<script src="assets/board-data.js"></script>
```

`board-data.js` already exposes `icon(name, size)`. Load `build/icons.js` only
when you are *not* loading `board-data.js` — both declare a top-level `ICON`.

## Constraints

- **Dark only.** `color-scheme: dark` is global; no light values exist in the
  evidence and none were invented.
- **No app icon, tray icon or favicon.** See `bdb-p2m` above.
- **No font binaries.** Geist and Geist Mono are loaded from Google Fonts.
- **No photographic avatars.** Monograms, by design.

## Editing

Change tokens in `colors_and_type.css` / `tokens.css` **and** in
`assets/bd-dark.css` together, or the preview cards and the UI kit will disagree
with the specification. `assets/bd-dark.css` is the runtime source of truth;
the two token files are its reusable, documented extract. If you change an
`oklch()` value, recompute the matching hex in the `@supports` fallback block.
