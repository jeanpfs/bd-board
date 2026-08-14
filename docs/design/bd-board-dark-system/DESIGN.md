# bd board — dark system

> Category: Project Design System
> Surface: web (desktop-first tool UI, Tauri desktop shell + browser)
> Derived from the Open Design project **"Redesign dark do bd-board"** (`0aedf231-ee41-492a-b0c0-8c6362012b3b`), linked to the `bd-board` repository.

Every value in this document was measured from the copied source files. Nothing
here is a preference: if a rule is stated, the file and the line that proves it
are named. Provenance per token lives in [`context/provenance.md`](context/provenance.md).

**Source evidence in this workspace**

| File | What it proves |
| --- | --- |
| [`assets/bd-dark.css`](assets/bd-dark.css) | The full token set and every component rule (1,525 lines) |
| [`board.html`](board.html) | Shell, swimlanes, filter bar, knowledge tab, keyboard model |
| [`bead-detail.html`](bead-detail.html) | Detail sheet, metadata rail, typed-confirmation delete |
| [`knowledge-detail.html`](knowledge-detail.html) | Same sheet reused for a second object type |
| [`projects.html`](projects.html) | Dashboard: stat tiles, stacked bars, ring gauge |
| [`index.html`](index.html) | The redesign's own rationale, written by its author |
| [`assets/board-data.js`](assets/board-data.js) | Domain model, status mapping, taxonomy, icon set |

---

## 1. Product context

`bd-board` is a local desktop board for **beads** — the work items of the `bd`
CLI, a dependency-graph issue tracker. It reads several repositories at once
from `~/Code/*`, shells out to the local `bd` binary, and renders the result.

Four facts about the product drive every visual decision:

1. **It is a tool, not a destination.** It stays open next to an editor all day.
   Density beats generosity; the body size is 14px and card text is 12.75px.
2. **It is local and read-only by default.** Writes are gated behind
   `BD_BOARD_ALLOW_WRITE`. The UI must always say which mode it is in — hence
   the persistent `Write mode` badge in the topbar.
3. **Work is a graph, not a list.** Beads block, are blocked by, and relate to
   each other. Edges are first-class UI: counted on the card, grouped in the
   sheet, and used to warn before a delete destroys them.
4. **Its users are a person and their agents.** The assignee list contains
   `jean.pfs2@gmail.com`, `claude-agent` and `codex-cli`. There are no
   profile photos to show, so there are no avatars — only monograms.

The redesign's stated goal, from `index.html`: *"mesma família de matiz, base
mais profunda, contraste corrigido e o acento dividido em preenchimento e
texto"* — same hue family, deeper base, corrected contrast, and the accent split
into fill and text.

### Screens

| # | Screen | File | Role |
| --- | --- | --- | --- |
| 01 | Board | `board.html` | Swimlanes by epic or priority, four status columns, quick filters, `/` search, Knowledge tab |
| 02 | Bead detail | `bead-detail.html` | Modal sheet over the board: content left, metadata right |
| 03 | Projects | `projects.html` | Multi-repository dashboard: aggregates, stacked bar, completion ring |
| 04 | Knowledge detail | `knowledge-detail.html` | The same sheet, applied to a knowledge entry |

---

## 2. Visual theme and atmosphere

A deep, near-neutral dark room lit by one violet accent.

- **One hue family.** Every surface is `oklch(L 0.006–0.008 270)`. The panels
  differ only in lightness, so stacked chrome reads as elevation rather than as
  a collection of different materials.
- **Rings, not borders.** Outlines are `inset 0 0 0 1px oklch(1 0 0 / 9%)`
  box-shadows. They compose with the drop shadow and the hover accent ring, and
  they never change a box's layout size.
- **Colour is reserved for meaning.** Chrome is grey. Hue appears only where it
  encodes something: status, priority, knowledge type, the accent.
- **One flourish, once.** The single gradient in the entire system is the 24px
  `bd` brand mark. Nothing else is gradient-filled.
- **Motion is functional.** 120ms on colour, 140ms when a card also lifts 1–2px,
  400ms only on a progress bar actually changing value.

---

## 3. Color

Full token source: [`colors_and_type.css`](colors_and_type.css).
Live cards: [`preview/colors-primary.html`](preview/colors-primary.html),
[`preview/colors-status.html`](preview/colors-status.html).

### 3.1 Surfaces — six elevation steps, one hue

| Token | Value | Where it lands |
| --- | --- | --- |
| `--background` | `oklch(0.155 0.006 270)` | App canvas, topbar, filter bar, sheet base |
| `--sidebar` | `oklch(0.168 0.006 270)` | Left rail, sheet metadata column |
| `--canvas` | `oklch(0.178 0.006 270)` | Recessed wells: lane cells, column heads, probe strip, comments |
| `--card` | `oklch(0.208 0.006 270)` | Bead card, project card, knowledge row, link row |
| `--popover` | `oklch(0.222 0.007 270)` | Menus, delete confirmation |
| `--card-hover` | `oklch(0.246 0.008 272)` | Card hover, pressed segmented button |

The base moved from `0.165` to `0.155` against the origin repo specifically to
buy one more elevation step without the top of the stack going grey.

### 3.2 Text — three levels with contrast floors

| Token | Value | Contrast | Use |
| --- | --- | --- | --- |
| `--foreground` | `oklch(0.945 0.004 270)` | — | Titles, active nav, metric values |
| `--muted-foreground` | `oklch(0.685 0.012 270)` | — | Body, inactive nav, bead ids, counts |
| `--faint` | `oklch(0.62 0.011 270)` | ≥ 4.5:1 on `--popover` | Eyebrows, timestamps, placeholders |

`--faint` is at its floor, not its taste value. `0.62` is the lowest lightness
that still clears 4.5:1 on `--popover`, the lightest surface it ever sits on.
Anything quieter fails inside menus.

### 3.3 Accent — split into two tokens, one role each

This is the central correction of the redesign, and the rule most likely to be
broken by accident.

| Token | Value | Role | Contrast |
| --- | --- | --- | --- |
| `--primary` | `oklch(0.54 0.19 268)` | Solid fill **only** | white text on it: **5.15:1** |
| `--primary-hover` | `oklch(0.47 0.175 268)` | Fill hover — **darker** | contrast rises |
| `--primary-text` | `oklch(0.72 0.16 268)` | Accent **as text or icon** | **6.59:1** on dark |
| `--primary-foreground` | `oklch(0.99 0.003 275)` | Text on `--primary` | — |

The origin repo used one accent token for both jobs and failed 4.5:1 in both
(**4.34:1**). Two rules follow, and neither is negotiable:

- Never set text to `--primary`. Never fill a button with `--primary-text`.
- **Hover darkens.** Lightening `--primary` on hover would drop white text to
  **3.99:1**. The hover goes to `L 0.47` and adds a
  `0 0 0 1px oklch(0.72 0.16 268 / 55%)` ring, so the affordance reads as
  *more* contrast, not less.

### 3.4 Status — the four board columns

| Token | Value | Column |
| --- | --- | --- |
| `--status-open` | `oklch(0.7 0.014 270)` | Open (near-neutral on purpose — "not started" is not a state worth colouring) |
| `--status-progress` | `oklch(0.74 0.14 248)` | In progress |
| `--status-blocked` | `oklch(0.7 0.19 22)` | Blocked |
| `--status-closed` | `oklch(0.74 0.16 152)` | Closed |
| `--warn` | `oklch(0.8 0.15 85)` | P1 chip, pinned tag |

`--status-in_progress` is an alias so `var(--status-{column})` resolves for
every key the data layer emits. Keep it if you rename anything.

### 3.5 Knowledge taxonomy — seven categorical hues

The seven prefixes parsed out of bead comments each get a hue, all held at
**L 0.75** so every one clears **7:1** on `--card`.

| Token | Value | Type |
| --- | --- | --- |
| `--k-decision` | `oklch(0.75 0.15 268)` | Decision |
| `--k-learned` | `oklch(0.75 0.13 200)` | Learned |
| `--k-fact` | `oklch(0.75 0.15 152)` | Fact |
| `--k-pattern` | `oklch(0.75 0.15 300)` | Pattern |
| `--k-investigation` | `oklch(0.79 0.15 90)` | Investigation |
| `--k-must-check` | `oklch(0.72 0.17 22)` | Must-check |
| `--k-deviation` | `oklch(0.76 0.15 40)` | Deviation |

**Hue is never the only channel.** Every knowledge chip carries its label in
text; the hue is a second, redundant cue. Consumers derive the tint and the
ring from the one hue with `color-mix(in oklch, var(--k) 15%, transparent)` and
`38%` — do not hand-author per-type fills.

### 3.6 Lines, washes and scrims

`--border: oklch(1 0 0 / 9%)` · `--border-strong: oklch(1 0 0 / 15%)` ·
`--ring: oklch(0.66 0.18 268)`.

Interactive fills are alpha-white washes at 5/6/7/8/9%, never a new grey.
The modal scrim is `oklch(0.09 0.005 270 / 72%)` with `blur(3px)`; command
preview blocks sit in `oklch(0 0 0 / 35%)`.

### 3.7 Danger — scoped to one flow

`oklch(0.5 0.2 22)` fill, `0.44` hover, `oklch(0.3 0.05 22)` disabled. Used
only by the typed-confirmation delete in `bead-detail.html`. Disabled is the
only state in the system permitted to reduce contrast.

---

## 4. Typography

Live card: [`preview/typography-specimens.html`](preview/typography-specimens.html).
Loading: [`fonts/geist.css`](fonts/geist.css).

**Two families, one job each.**

- **Geist Sans** (`300..700`) carries reading: titles, descriptions, comments.
- **Geist Mono** (`400..600`) carries the machine register: bead ids, counts,
  durations, section eyebrows, `bd` commands, file paths. From `index.html`:
  *"Geist Mono carrega id, contagem e rótulo de seção; Geist Sans carrega
  leitura."*

Base is `14px`, with `font-feature-settings: 'cv01','cv03','ss01'` on. Every
number that sits in a column uses `font-variant-numeric: tabular-nums`.

### Scale

| Role | Size | Weight | Tracking | Leading |
| --- | --- | --- | --- | --- |
| Overview hero `h1` | 34px | 600 | −0.028em | 1.12 |
| Stat tile value | 28px | 600 | −0.025em | — |
| Page title | 22px | 600 | −0.02em | — |
| Sheet title | 20px | 600 | −0.015em | 1.28 |
| Card heading | 16px | 550 | −0.012em | — |
| Project card title | 15px | 550 | −0.01em | — |
| Body / base | 14px | 400 | — | — |
| Prose | 13.5px | 400 | — | 1.68 |
| UI text (nav, tabs, comments) | 13px | 400 / 550 active | — | — |
| Bead title, knowledge excerpt | 12.75px | 400 | — | 1.45 / 1.58 |
| Controls (button, input, menu) | 12.5px | 500 / 550 primary | — | — |
| Meta (lane ratio, command) | 11.5px | 400 mono | — | 1.55 |
| Ids, counts, paths | 11px | 400 mono | — | — |
| Eyebrow / section label | 10px | 500 mono | 0.09em, uppercase | — |
| Tag, priority chip | 10px | 600 | 0.06em (tag) / mono (chip) | 1.5 |

**Weight 550 is real.** Geist is variable and `550` is used constantly for
"slightly emphasised" — lane titles, project card titles, primary button
labels, the breadcrumb leaf. Rounding it to 500 or 600 visibly changes the app.

**Negative tracking scales with size.** Nothing below 16px gets tracked in;
nothing above 20px is left at 0.

**Uppercase is a label mechanism, not emphasis.** Only mono eyebrows (0.09em)
and tags (0.06em) are uppercased. Never uppercase a sentence.

---

## 5. Spacing

Full token source: [`tokens.css`](tokens.css).
Live card: [`preview/spacing-tokens.html`](preview/spacing-tokens.html).

A **2px-based dense scale**. The useful range is 2 → 28px; anything larger is
page chrome, not component spacing.

| Step | Value | Typical use |
| --- | --- | --- |
| 1–2 | 2, 4px | Segmented track padding, chip nudge, menu rule margin |
| 3–5 | 5, 6, 7px | Icon-to-label, chip gap, card padding-y |
| 6–8 | 8, 10, 12px | Rail item padding, card padding-x, board column gap |
| 9–11 | 14, 16, 18px | Lane stack gap, canvas padding-x, rail group separation |
| 12–16 | 20, 22, 24, 26, 28px | Dialog padding, sheet body padding and section gap, viewport inset |

Component padding, as built:

- Bead card `9px 10px` · knowledge row `10px 12px` · project card `16px`
- Rail item `6px 8px` · button `0 10px` at `30px` tall · filter chip `0 10px` at `26px`
- Sheet head `16px 22px 14px` · sheet body `22px`, `26px` between sections
- Menu `5px` outer, items `6px 8px`

**Radius tracks object size**: 4px chips → 7px controls → 8px cards →
9px rows → 12px tiles → 14px sheet → 999px pills.
See [`preview/radius-shadows.html`](preview/radius-shadows.html).

---

## 6. Layout and composition

**The shell is constant.** Every screen is `grid-template-columns: 232px minmax(0, 1fr)`
at `100dvh`: a fixed rail and a scrolling main. The rail brand row and the
topbar are both `48px`, so the horizontal rules line up across the split.

```
┌─ rail 232px ─┬─ main ────────────────────────────────┐
│ brand   48px │ topbar 48px  crumbs · tabs · mode · me │
├──────────────┼───────────────────────────────────────┤
│ Projects     │ filter bar   group · priority · sort   │
│ View         ├───────────────────────────────────────┤
│ Quick filters│ canvas (the only scrolling region)     │
├──────────────┤                                       │
│ bd 1.2.1     │                                       │
└──────────────┴───────────────────────────────────────┘
```

- **One scroll container.** `.canvas` scrolls; the rail, topbar and filter bar
  are `flex: none`. Nothing else on the page scrolls the window.
- **Board grid.** Four equal status columns, `repeat(4, minmax(0, 1fr))`, 12px
  gap. The column header row is `position: sticky; top: 0` with a 92%-opacity
  background and `backdrop-filter: blur(8px)` so cards pass under it.
- **Swimlanes.** Grouped by epic, priority or status. A lane is a header plus a
  four-cell grid; collapse state is per-lane and persisted.
- **Detail sheet.** `minmax(0, 1fr) 268px` inside `min(1080px, 100%)` ×
  `min(860px, 100%)`, centred with a 28px inset. Content scrolls on the left,
  metadata sits in a `--sidebar` column on the right. **Both detail screens use
  the same sheet** — that is why a knowledge entry feels like a real object.
- **Projects dashboard.** `1240px` centred column: four stat tiles, then a
  3-column card grid.

### Responsive behaviour

| Breakpoint | Change |
| --- | --- |
| ≤ 1240px | `.hide-sm` drops the inline lane progress bar; the ratio stays |
| ≤ 1100px | Knowledge aside stacks below the list; overview grid 4 → 2 |
| ≤ 1080px | Project grid 3 → 2, stat tiles 4 → 2 |
| ≤ 900px | Sheet metadata column moves below content, border-left → border-top |
| ≤ 720px | Project grid → 1 column |

The board's four columns are **not** collapsed at small widths. A four-column
board is the product; below tablet width this is a desktop tool that scrolls.

---

## 7. Components

Live cards: [`preview/components-buttons.html`](preview/components-buttons.html),
[`preview/components-cards.html`](preview/components-cards.html).
Applied kit: [`ui_kits/app/`](ui_kits/app/).

### Buttons — `30px` tall, `7px` radius, `12.5px` label

| Variant | Rest | Hover |
| --- | --- | --- |
| `.btn-primary` | `--primary` fill, `--primary-foreground`, 550 | fill → `--primary-hover` **+** accent ring at 55% |
| `.btn-outline` | transparent, `--muted-foreground`, `--border-strong` ring | wash 6% + `--foreground` |
| `.btn-ghost` | transparent, `--muted-foreground` | wash 7% + `--foreground` |
| `.btn-danger` | `oklch(0.5 0.2 22)` | `0.44` + red ring; disabled drops to `oklch(0.3 0.05 22)` |

`[aria-expanded="true"]` gets wash 8% + `--foreground`, so an open menu's
trigger stays visibly engaged.

**One primary per surface.** The board has exactly one filled button —
`New bead`. The sheet has exactly one — `Comment`. Everything else is outline,
ghost or a text link.

### Nav — rail item, tab, breadcrumb

Rail item: `13px`, `--muted-foreground`, `7px` radius. Hover → wash 6% +
`--foreground`. Active (`[aria-current="page"]` or `.is-active`) → wash 8% +
`--foreground` + inset ring. Trailing `.count` in mono `11px`, `--faint`,
brightening to `--muted-foreground` with the row.

Tab: bottom-border only. Selected → `--foreground`, weight 550, and a 2px
`--primary-text` underline. The board tab set is mirrored in the rail, and both
stay in sync from one state object.

### Controls

- **Search** — `30px`, wash 5%, inset ring, `210px` wide, `/` shown in a `.kbd`
  chip until the field has a value. Focus swaps the ring for `--ring` and the
  fill to wash 8%. `/` focuses it from anywhere; `Escape` blurs.
- **Segmented** — a wash-5% track with 2px padding; the pressed button gets
  `--card-hover` plus a 1px drop shadow, so it reads as a raised key.
- **Filter chip** — `26px` pill, ring at rest. Pressed: `--primary` at 26%,
  text `oklch(0.92 0.05 268)`, ring `--ring` at 55%. A *knowledge type* chip
  overrides this with its own hue instead of the generic accent.
- **Menu** — `--popover`, `10px` radius, `--shadow-pop`, mono uppercase label,
  a right-aligned tick that is `visibility: hidden` (not removed) when off, so
  rows never shift.
- **Select** — appearance-stripped, `--card` fill, `--border-strong` ring, a
  chevron positioned absolutely. Hover raises the ring to accent at 50%.

### Bead card — the atom of the board

`--card`, `8px` radius, `9px 10px`, `inset ring + --shadow-card`. Three rows:

1. **Top** — mono id · priority chip · epic/state tag · relative timestamp
2. **Title** — 12.75px, clamped to 2 lines via `-webkit-line-clamp`
3. **Foot** — up to 2 label chips, then a mono stat cluster: subtasks, blocked-by
   (red), blocking, related, comments, and the assignee monogram

Hover: `--card-hover`, accent ring at 45%, `--lift-card`, `translateY(-1px)`.
An epic adds a 2px `--primary-text` left border and a stacked progress bar.

### Knowledge row

A 2px hue stripe, the type chip, the id, the age, a 2-line excerpt, and the
source bead. Hover tints the ring with the entry's own hue — not the accent.

### Progress and gauges

- **Stacked bar** — `5px`, `999px`, wash-7% track, segments in status order
  `closed → in_progress → blocked → open`, width animated over 400ms.
- **Ring** — 52px SVG, `r=21`, 4px stroke, `--status-closed` arc on a wash-8%
  track, rotated −90°, percentage in mono at the centre. `role="img"` with an
  `aria-label`.
- **Stat tile** — status dot + label, a 28px tabular value **in the status
  colour**, and a mono footnote giving the share of the total.

Charts always use a filled encoding. There is no outline-only chart anywhere.

### Chips

`p-chip` (P0 red → P4 faint, mono 10px, `inset ring: currentColor`) ·
`tag` (uppercase 10px: Epic, Deferred, Hooked, Pinned) ·
`label-chip` (free-text label, `92px` max with ellipsis) ·
`ktag` (mono uppercase + hue dot) · `rel-chip` (graph relation) ·
`mode-badge` (green pill: read-only vs write mode).

### Avatar

A monogram plate: `19px`, wash 9%, `--border-strong` ring, mono 9px initials.
`26px` variant in the sheet. From `index.html`: *"Sem fotos. Assignee é
monograma sobre superfície neutra."* There is no image avatar in this system.

### Destructive confirmation

Delete requires **typing the bead id**, not clicking a confirm. The dialog
states the exact edge loss ("3 subtasks, 2 dependencies") and previews the CLI
command it will run. The confirm button stays disabled until the typed value
matches exactly. From the source knowledge base: *"Deletion drops dependency
edges that no undo can rebuild, so the friction is deliberate."*

### Command preview

Every mutating surface shows the `bd` command it is about to run, in mono on
`oklch(0 0 0 / 35%)`. This is a trust device, not decoration — the app shells
out to a real binary against real repositories, and it says so.

---

## 8. Motion and interaction

| Duration | Applies to |
| --- | --- |
| 120ms ease | Nav, buttons, chips, menu items, inputs, selects — colour only |
| 140ms ease | Cards that also lift (bead, project, overview) |
| 160ms ease | Lane disclosure chevron rotation |
| 400ms ease | Progress bar segment width, when the value actually changes |

**State rules**

- **Hover moves the background, never the foreground.** Backgrounds shift
  ±0.06–0.12 on the OKLch L channel or gain a wash; text goes *up* toward
  `--foreground`, never down toward `--muted-foreground`. There is no
  "text fades on hover" anywhere in this system.
- **Lift is 1–2px**, always paired with a shadow and an accent ring.
- **Focus** is a 2px `--ring` outline at `2px` offset on every focusable
  element. Inputs additionally swap their inset ring to `--ring`.
- **Pressed / selected** is expressed by fill + ring + weight together, never by
  colour alone.
- **Disabled** is the only state allowed to lose contrast.
- `prefers-reduced-motion: reduce` collapses every duration to `0.01ms`.

**Keyboard**

`/` focuses search from anywhere · `Escape` closes menus, blurs search, and
closes a sheet back to the board · the delete dialog traps `Escape` to cancel
before the sheet handles it · lane toggles are real buttons with
`aria-expanded` · tabs use `role="tablist"` / `aria-selected` · menus use
`role="menuitemcheckbox"` and `menuitemradio`.

**Persistence**

Board state (tab, grouping, sort, priority filter, quick filter, query,
collapsed lanes, knowledge type) is one object in `localStorage` under
`bdb.board.v1`, and reads are wrapped in `try/catch` because `localStorage`
throws outright under `file://` and in sandboxed frames. The board must still
render there.

---

## 9. Voice and brand

**Brand mark.** A 24px rounded square (`7px`), the only gradient in the system:
`linear-gradient(160deg, var(--primary-text), var(--primary-hover))`, with a
lowercase mono `bd`. Wordmark: `bd board`, 13px, 600, −0.01em. Never title-cased.

**Copy rules, as written in the source**

- **Sentence case everywhere.** "New bead", "Assigned to me", "In progress",
  "Group by". Never Title Case, never ALL CAPS outside mono eyebrows.
- **Domain words stay domain words.** bead, epic, edge, lane, blocked by,
  blocking, ready, knowledge entry, write mode.
- **Explain the mechanism, don't hide it.** *"bd has no knowledge entity — this
  is an ordinary bead comment. The board promotes it because the text opens
  with a recognised prefix."* Empty states are literal: `No beads match the
  current filters`, and a lane cell with nothing in it shows an em dash.
- **Warnings state the consequence, not the severity.** "This action cannot be
  undone. Linked work loses its edges: 3 subtasks, 2 dependencies."
- **Never fabricate.** The sample dataset mirrors the real bd-board roadmap.
  No lorem, no invented metrics, no fake user names.
- **UI is English.** The overview page is Portuguese because it is the author's
  own design rationale, not product surface. Keep that split.

---

## 10. Anti-patterns

Do not:

- **Use one accent token for both fill and text.** That is the exact bug this
  redesign fixed (4.34:1 in both roles). `--primary` fills; `--primary-text` writes.
- **Lighten a primary fill on hover.** It drops white text to 3.99:1. Darken it
  and add a ring.
- **Grey out text on hover.** Foreground moves toward `--foreground`, never away.
- **Use `border` for card outlines.** Use `inset 0 0 0 1px`, so the ring
  composes with elevation and hover without a layout shift.
- **Encode anything by hue alone.** Every status dot, priority chip and
  knowledge tag carries its label. Priority chips also differ in text.
- **Ship raw hex.** Everything is `oklch()` on a token. There is an open bead in
  the source data — `bdb-l6q`, *"Move the remaining raw hex values onto tokens"* —
  precisely because this drifts.
- **Add a second icon family, or emoji as icons.** One monoline 24px set,
  `stroke-width: 1.7`, `currentColor`, in [`build/icons.js`](build/icons.js).
- **Add gradients.** One exists, on the 24px brand mark. That is the budget.
- **Use photographic avatars.** Monograms only — there is no people directory
  behind this app.
- **Put more than one filled button in a viewport for the same action.**
- **Round 550 to 500 or 600**, or drop the `cv01/cv03/ss01` feature settings.
- **Introduce a light theme.** The system is dark-only; `color-scheme: dark` is
  global and no light values exist in the evidence.
- **Loosen the density** to "breathe". 14px base and 12.75px card text are the
  product decision, not an oversight.
- **Animate layout size.** Motion is on colour, shadow, transform and — only for
  real data — width.
- **Add presenter-only chrome.** There are no theme switchers, no demo control
  panels, no decorative dashboards in this app.

---

## 11. Package map

| Path | Contents |
| --- | --- |
| `DESIGN.md` | This document |
| `README.md` | Human orientation and quick start |
| `SKILL.md` | Agent-facing build instructions |
| `colors_and_type.css` | Color + typography tokens |
| `tokens.css` | Spacing, radius, elevation, layout, motion tokens |
| `fonts/geist.css` | Typeface loading contract |
| `assets/bd-dark.css` | **Preserved source** — the full component stylesheet |
| `assets/board-data.js` | **Preserved source** — domain model, taxonomy, icon set |
| `assets/icons/` | 27 extracted SVGs + `manifest.json` |
| `build/icons.js` | Runtime icon module (`bdIcon`, `bdHydrateIcons`) |
| `preview/` | 9 focused review cards + `index.html` manifest |
| `ui_kits/app/` | Applied kit — 5 working surfaces: `app-shell`, `board-canvas`, `detail-sheet`, `dashboard-surface`, `controls-and-inputs` |
| `ui_kits/app/components/` | 5 copyable partials: `sidebar`, `topbar`, `status-column`, `bead-card`, `composer` |
| `board.html`, `bead-detail.html`, `knowledge-detail.html`, `projects.html`, `index.html` | **Preserved source screens**, unmodified |
| `context/source-context.md`, `context/provenance.md` | Handoff and per-token provenance |
