---
name: bd-board-dark-system
description: Build UI in the bd board dark system — a dense, dark-only tool interface for local developer tooling and dependency-graph work boards. Use when designing or extending bd-board screens, or any desktop-first tool that needs a deep neutral base, one violet accent split into contrast-safe roles, status-coded work items, and a mono/sans register split. Not for marketing pages, light themes, or consumer surfaces.
user-invocable: true
---

# bd board — dark system

A dark-only, high-density system for a desktop developer tool. Dense over
generous, honest over decorative, one accent used sparingly and split into two
contrast-safe roles.

## What is inside

| Path | What it gives you |
| --- | --- |
| `DESIGN.md` | The full specification — context, color, typography, spacing, layout, components, motion, voice, anti-patterns |
| `colors_and_type.css` | Color and typography tokens, with an sRGB fallback layer |
| `tokens.css` | Spacing, radius, elevation, layout and motion tokens |
| `fonts/geist.css` | The typeface loading contract (Geist + Geist Mono, CDN) |
| `assets/bd-dark.css` | **Preserved source** — the complete component stylesheet |
| `assets/board-data.js` | **Preserved source** — domain model, taxonomy, icon set |
| `assets/icons/` | 27 icons extracted as standalone SVGs, plus `manifest.json` |
| `build/icons.js` | Runtime icon module — `bdIcon(name, size)`, `bdHydrateIcons()` |
| `preview/` | Nine focused review cards plus a manifest |
| `ui_kits/app/` | Five working surfaces and a `components/` folder of copyable partials |
| `context/provenance.md` | Where every value came from, and what the evidence lacks |

## Source context

Generated from the Open Design project **"Redesign dark do bd-board"**
(`0aedf231-ee41-492a-b0c0-8c6362012b3b`), whose linked repository is
`bd-board`. The evidence is seven preserved files: one component
stylesheet, one data module, and five screens — board, bead detail, knowledge
detail, projects dashboard, and the author's own rationale page.

`bd-board` is a local desktop board for **beads**, the work items of the `bd`
CLI, a dependency-graph issue tracker. It reads several repositories at once
from `~/Code/*`, shells out to the local `bd` binary, and is **read-only by
default** — writes are gated behind `BD_BOARD_ALLOW_WRITE`.

Every rule below is traceable to that evidence. Nothing was invented; the gaps
are listed explicitly in `context/provenance.md`.

## When to use

Use this skill when building or extending:

- bd-board screens themselves — board, detail sheet, dashboard;
- any desktop-first developer tool with dense tabular work items, status
  columns, dependency graphs, or a repository-scoped left rail;
- prototypes and production interfaces that need this exact dark register.

Do not use it for marketing pages, consumer apps, light themes, or anything
that needs a generous, editorial layout. The density here is a product
decision, not a default.

## How to use

**Read first:** `DESIGN.md` in full, then skim `colors_and_type.css` and
`tokens.css` for the token names. Open `ui_kits/app/index.html` and copy the
surface closest to what you are building rather than starting blank. Do not
restate these files back to the user — build with them.

**Building a bd-board screen** — load the preserved stylesheet. It already
contains both token sets plus every component rule, so it cannot drift:

```html
<link rel="preconnect" href="https://fonts.googleapis.com" />
<link rel="preconnect" href="https://fonts.gstatic.com" crossorigin />
<link href="https://fonts.googleapis.com/css2?family=Geist:wght@300..700&family=Geist+Mono:wght@400..600&display=swap" rel="stylesheet" />
<link rel="stylesheet" href="assets/bd-dark.css" />
<script src="assets/board-data.js"></script>
```

**Applying the system to a different product** — load the two token files and
write your own components against them:

```html
<link rel="stylesheet" href="colors_and_type.css" />
<link rel="stylesheet" href="tokens.css" />
```

**Icons:** `assets/board-data.js` already exposes `icon(name, size)`. Load
`build/icons.js` **only** when you are not loading `board-data.js` — both
declare a top-level `ICON`, and loading both throws a redeclaration error.
Standalone files live in `assets/icons/`.

**Review:** open `preview/index.html`. When you add a component, extend the
matching card instead of creating a new one.

## Design system highlights

- **Color — one hue family, six surfaces.** Every panel is a lightness step on
  `oklch(… 0.006 270)`: `--background` `0.155` → `--sidebar` `0.168` →
  `--canvas` `0.178` → `--card` `0.208` → `--popover` `0.222` →
  `--card-hover` `0.246`.
- **The accent is two tokens.** `--primary` `oklch(0.54 0.19 268)` fills only
  (white on it: 5.15:1); `--primary-text` `oklch(0.72 0.16 268)` writes only
  (6.59:1). One token for both roles is the 4.34:1 bug this system fixes.
- **Typography — a two-family register split.** Geist Sans reads; Geist Mono
  carries ids, counts, durations, eyebrows and `bd` commands, always with
  tabular figures. Weight `550` is a real variable instance and is load-bearing.
- **Spacing — a 2px dense scale**, 2 → 28px, with a bead card at `9px 10px`
  and a 12px board gutter.
- **Radius tracks object size**: 4px chip → 7px control → 8px card → 9px row →
  12px tile → 14px sheet → 999px pill.
- **Shadows are two, outlines are rings.** `--shadow-card` for resting cards,
  `--shadow-pop` for layers; every outline is `inset 0 0 0 1px`, never `border`.
- **Icons** are one monoline 24px family, `stroke-width: 1.7`, `currentColor`,
  rendered at 11–15px.
- **Layout** is a constant shell: `var(--rail) minmax(0, 1fr)` at `100dvh`, with
  a 48px topbar matching the 48px rail brand row, and only `.canvas` scrolling.
- **Interaction** moves the background and brightens the foreground — never the
  reverse. 120ms on colour, 140ms when a card lifts, 400ms only on real data.

## Hard rules

These are the ones that get broken. Check each before delivering.

1. **`--primary` fills. `--primary-text` writes.** Never set text to
   `--primary`; never fill with `--primary-text`.
2. **Hover darkens a primary fill** to `--primary-hover` (`L 0.47`) plus
   `0 0 0 1px oklch(0.72 0.16 268 / 55%)`. Lightening it drops white text to
   3.99:1.
3. **Foreground never dims on hover.** Backgrounds move ±0.06–0.12 L or gain a
   wash; text moves toward `--foreground`. Disabled is the only state allowed to
   lose contrast.
4. **One filled button per surface.** Everything else is `.btn-outline`,
   `.btn-ghost` or a text link.
5. **Outlines are `inset 0 0 0 1px`**, never `border`, so the ring composes with
   elevation and hover without a layout shift.
6. **Hue is never the only channel.** Every status dot, priority chip and
   taxonomy tag carries its label in text.
7. **Mono is the machine register**, always `tabular-nums`. Sans is for prose.
8. **Keep weight 550** and `font-feature-settings: 'cv01','cv03','ss01'`.
9. **Only `.canvas` scrolls.** Rail, topbar and filter bar are `flex: none`.
10. **Any surface that mutates previews its `bd` command** in a `.cmd-preview`
    block before it runs.
11. **Every focusable element** keeps the global 2px `--ring` focus ring.

## Never

- A light theme, or a raw hex value in component code — everything is `oklch()`
  on a token. (The one hex block in `colors_and_type.css` is a labelled
  `@supports` fallback, not a token source.)
- A second icon family, filled glyphs, or emoji used as icons.
- A gradient anywhere except the 24px `bd` brand mark.
- Photographic avatars — monograms only.
- Loosening the density "to breathe". 14px base and 12.75px card text are the
  product decision.
- Inventing an app icon, tray icon or favicon. None exist in the evidence; the
  source project has an open bead (`bdb-p2m`) for that work.
- Animating layout size. Motion is on colour, shadow, transform, and width only
  when real data changes.
- Presenter-only chrome: no theme switchers, no demo control panels.

## Building a screen

1. **Pick the shell.** `grid-template-columns: var(--rail) minmax(0, 1fr)` at
   `100dvh`. Rail brand row and topbar are both 48px.
2. **Pick the surface.** Board canvas, object detail sheet, or dashboard — all
   three exist working in `ui_kits/app/`.
3. **Place content on the elevation ladder.** `--background` for the page,
   `--canvas` for recessed wells, `--card` for objects, `--popover` for layers.
4. **Use the real domain vocabulary.** bead, epic, edge, lane, blocked by,
   blocking, ready, knowledge entry, write mode. Sentence case, never Title Case.
5. **Never fabricate data.** The sample set in `assets/board-data.js` mirrors
   bd-board's own roadmap. If you need new records, write plausible engineering
   work — not lorem, not invented metrics.

## Component reference

| Need | Class | Note |
| --- | --- | --- |
| Work item | `.bead` | id · priority · tag · age / 2-line title / labels + stat cluster |
| Swimlane | `.lane` + `.lane-head` + `.lane-grid` | `data-open` drives collapse |
| Column header | `.col-head.col-{status}` | sticky, blurred, coloured dot + count |
| Object detail | `.sheet` + `.sheet-main` + `.meta` | `1fr / 268px`, shared by both detail types |
| Knowledge entry | `.k-row.k-{type}` | hue stripe + `.ktag`, tinted via `color-mix` |
| Buttons | `.btn` + `-primary` / `-outline` / `-ghost` | 30px, 7px radius, 12.5px label |
| Filters | `.segmented`, `.chip-filter`, `.menu` | `aria-pressed`, `aria-expanded`, `aria-checked` |
| Search | `.search` + `.kbd` | `/` focuses, `Escape` blurs |
| Progress | `.bar` + `.seg-{status}` | order: closed → in_progress → blocked → open |
| Metric | `.stat-tile` | value in the status colour + share-of-total footnote |
| Identity | `.brand-mark`, `.avatar`, `.mode-badge` | the mode badge is identity, not chrome |
| Chips | `.p-chip.p0–p4`, `.tag`, `.label-chip`, `.rel-chip` | all carry text |

## Before delivering

- [ ] No `--primary` used as text, no `--primary-text` used as a fill
- [ ] Every hover darkens or washes the background; no text dims
- [ ] Exactly one filled button per viewport, per action
- [ ] Every coloured mark also carries a label
- [ ] All ids, counts, durations and commands are mono + tabular
- [ ] Focus rings intact on every interactive element
- [ ] No raw hex in components, no gradient beyond the brand mark, no emoji icons
- [ ] Any mutating action previews its `bd` command
- [ ] Nothing overlaps, clips, or overflows at 1440, 1100 and 900px
