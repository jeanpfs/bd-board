# bd board — applied UI kit

Five working surfaces and five copyable component partials, all built on the
product's own stylesheet and dataset. This is not a static mock set: every file
loads [`../../assets/bd-dark.css`](../../assets/bd-dark.css) and
[`../../assets/board-data.js`](../../assets/board-data.js), so nothing here can
drift from the source. Change the stylesheet and the kit changes with it.

Start at [`index.html`](index.html).

## Structure

```
ui_kits/app/
├── index.html                 kit launcher — surfaces, wiring snippet, rules
├── app-shell.html             application chrome with an annotated canvas slot
├── board-canvas.html          working swimlane board
├── detail-sheet.html          bead ⇄ knowledge object sheet, typed delete
├── dashboard-surface.html     stat tiles, stacked bars, completion rings
├── controls-and-inputs.html   the full control inventory, wired
├── components/
│   ├── sidebar.html           the 232px project rail
│   ├── topbar.html            breadcrumbs, view tabs, mode badge, filter bar
│   ├── status-column.html     sticky status columns + collapsible swimlanes
│   ├── bead-card.html         the atom of the board, inside a lane cell
│   └── composer.html          comment field, command preview, knowledge prefixes
└── README.md                  this file
```

### Surfaces

| File | What is wired |
| --- | --- |
| `index.html` | Overview of every surface, the wiring snippet, and the non-negotiable rules |
| `app-shell.html` | Rail project selection, view tabs mirrored between rail and topbar, quick-filter toggles, write-mode ⇄ read-only badge, `/` to focus search. The canvas is an annotated slot. |
| `board-canvas.html` | Group by epic / priority / status, sticky column headers, collapsible lanes, ready / blocked / assigned-to-me filters, live search, epic progress bars |
| `detail-sheet.html` | One sheet, two object types — switch between a bead and a knowledge entry in place. The status select writes its own `bd update` preview, comments post live, delete requires typing the bead id. |
| `dashboard-surface.html` | Aggregate stat tiles, probe strip, sortable project grid with a stacked bar plus a completion ring |
| `controls-and-inputs.html` | Every button variant, search with the `/` shortcut, segmented groups, filter chips, popover menus with outside-click dismissal, select with command preview, disabled-until-valid submit |

### Components

Each partial is a standalone page: the live markup on one side, the rules that
govern it on the other. Open one, copy the element, delete the surrounding
`.doc` and `.mount` scaffolding.

| File | Component | Anatomy |
| --- | --- | --- |
| `components/sidebar.html` | Project rail | `.rail` → `.rail-brand` (48px) + `.rail-scroll` + `.rail-foot`; rows are `.rail-item` with a trailing `.count` |
| `components/topbar.html` | Topbar + filter bar | `.topbar` (48px) → `.crumbs` + `.tabs` + `.topbar-end`; `.filterbar` below at `8px 16px` |
| `components/status-column.html` | Column + swimlane | Sticky `.col-head-row`, then `.lane` → `.lane-head` + `.lane-grid` of four `.lane-cell` wells |
| `components/bead-card.html` | Bead card | `.bead` → `.bead-top` / `.bead-title` / `.bead-foot`; `.is-epic` adds the accent border and a progress bar |
| `components/composer.html` | Comment composer | `textarea` + one primary button + a live `.cmd-preview`; recognises the seven knowledge prefixes as you type |

## Usage

1. **Copy** the surface or component file closest to what you are building.
   Never start from a blank page — the shell measurements are load-bearing.
2. **Delete the kit scaffolding.** Every file marks it: `.kit-bar`,
   `.kit-note`, `.kit-switch`, `.slot`, `.doc`, `.mount`. They exist only to
   annotate the kit.
3. **Keep the `<head>`** — the Google Fonts request, then `assets/bd-dark.css`.
   Adjust the relative depth of the `../../` paths for your new location
   (`components/` files use `../../../`).
4. **Replace the data source.** Swap `assets/board-data.js` for your real one.
   The shapes the kit depends on — `Bead`, `Project`, and the knowledge entry —
   are documented in that file's header comment.
5. **Compose.** Drop a component into `app-shell.html`'s canvas slot to build a
   new screen; the shell, the surface and the partials are designed to nest in
   that order.

## Design Notes

**Shell contract**

```
<div class="shell">              grid: var(--rail) minmax(0, 1fr), height 100dvh
  <aside class="rail">           background --sidebar, brand row 48px
  <div class="main">
    <header class="topbar">      48px — matches the rail brand row exactly
    <div class="filterbar">      flex: none
    <div class="canvas">         the ONLY scrolling region
```

The rail brand row and the topbar are both 48px so the horizontal rule crosses
the window unbroken. That single alignment is what makes the split shell read as
one surface — do not change one height without the other.

**Non-negotiables**

- `--primary` fills, `--primary-text` writes. One token per role; swapping them
  reintroduces the 4.34:1 contrast bug this system was built to fix.
- Hover **darkens** a primary fill to `L 0.47` and adds a ring. Lightening it
  drops the white label to 3.99:1.
- Foreground never fades on hover. Backgrounds move; text goes toward
  `--foreground`, never away.
- Outlines are `inset 0 0 0 1px`, not `border`.
- One filled button per surface. Everything else is outline, ghost or a link.
- Hue is never the only channel — every dot, chip and tag carries its label.
- Mono for the machine register (ids, counts, durations, `bd` commands), always
  with tabular figures.
- Any surface that mutates previews the `bd` command it will run.
- No emoji as icons, no second icon family, no gradients beyond the brand mark,
  no photographic avatars, no light theme.

## Source

Every file here is built directly on the preserved source evidence, not on a
copy of it:

- **Stylesheet** — `../../assets/bd-dark.css`, the unmodified component
  stylesheet from `bd-board`. All layout, colors and typography come from
  its tokens; the kit adds no component CSS of its own beyond scaffolding.
- **Data** — `../../assets/board-data.js`, the unmodified sample dataset that
  mirrors bd-board's real roadmap, plus the icon set and the status/taxonomy
  mappings.
- **Screens** — the unmodified originals sit at the package root:
  [`../../board.html`](../../board.html),
  [`../../bead-detail.html`](../../bead-detail.html),
  [`../../projects.html`](../../projects.html),
  [`../../knowledge-detail.html`](../../knowledge-detail.html).

## Related

- Full specification: [`../../DESIGN.md`](../../DESIGN.md)
- Agent instructions: [`../../SKILL.md`](../../SKILL.md)
- Reusable tokens: [`../../colors_and_type.css`](../../colors_and_type.css),
  [`../../tokens.css`](../../tokens.css)
- Icon module: [`../../build/icons.js`](../../build/icons.js) — note that
  `assets/board-data.js` already exposes the same set as `icon(name, size)`;
  loading both in one page would redeclare `ICON`.
- Review cards: [`../../preview/index.html`](../../preview/index.html)
- Provenance: [`../../context/provenance.md`](../../context/provenance.md)
