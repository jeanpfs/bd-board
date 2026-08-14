# Provenance

Where every generated artifact in this package came from, and what was
**not** derivable from the evidence.

Source project: **Redesign dark do bd-board** (`0aedf231-ee41-492a-b0c0-8c6362012b3b`)
Linked repository: `bd-board`
Design system id: `user:redesign-dark-do-bd-board-design-system`

---

## 1. Evidence inventory

| File | Bytes | Status | What was taken from it |
| --- | --- | --- | --- |
| `assets/bd-dark.css` | ~26 KB | **preserved, unmodified** | Every colour, radius, shadow, duration, layout measure and component rule |
| `assets/board-data.js` | ~26 KB | **preserved, unmodified** | Domain model, status mapping, knowledge taxonomy, icon set, copy tone |
| `board.html` | ~28 KB | **preserved, unmodified** | Shell, swimlanes, filter bar, knowledge tab, keyboard + persistence model |
| `bead-detail.html` | ~19 KB | **preserved, unmodified** | Detail sheet, metadata rail, danger tokens, typed confirmation |
| `knowledge-detail.html` | ~14 KB | **preserved, unmodified** | Sheet reuse for a second object type, `.raw` block, type navigator |
| `projects.html` | ~14 KB | **preserved, unmodified** | Stat tiles, stacked bar, ring gauge, probe strip |
| `index.html` | ~9 KB | **preserved, unmodified** | The author's own rationale — the contrast numbers and the four decisions |

No source file was edited, stubbed or replaced. The preview cards and the UI
kit reference these files by relative path rather than copying their contents.

---

## 2. Token provenance

| Token group | Source | Line region |
| --- | --- | --- |
| Surfaces (`--background` … `--sidebar`) | `assets/bd-dark.css` | `:root`, 11–16 |
| Text (`--foreground`, `--muted-foreground`, `--faint`) | `assets/bd-dark.css` | 18–22, with the 4.5:1 floor stated in the source comment |
| Accent (`--primary*`) | `assets/bd-dark.css` 24–27; contrast ratios from `index.html` token notes | — |
| Lines (`--border*`, `--ring`) | `assets/bd-dark.css` | 29–31 |
| Status (`--status-*`, `--warn`) | `assets/bd-dark.css` | 33–40 |
| Knowledge (`--k-*`) | `assets/bd-dark.css` | 42–51, with the 7:1 note in the source comment |
| Danger (`--danger*`) | `bead-detail.html` inline `<style>` | `.btn-danger` rules |
| Fonts | `assets/bd-dark.css` 53–56; Google Fonts request from all four screen `<head>`s | — |
| `--rail`, `--shadow-card`, `--shadow-pop`, `--radius` | `assets/bd-dark.css` | 9, 58–61 |

### Measured, not declared

The source declares a handful of tokens and then hard-codes the rest inline.
These were measured across the four screens and promoted into `tokens.css`:

- **Spacing scale** — read off component padding and gaps (`9px 10px` bead card,
  `12px` column gap, `22px` sheet body, `26px` sheet section gap, …).
- **Radius ladder** — 4 / 5 / 6 / 7 / 8 / 9 / 10 / 12 / 14 / 999px, each tied to
  the component that uses it.
- **Type scale** — every distinct `font-size` in the four screens, including the
  sub-pixel values (12.75, 12.5, 11.5) which are intentional in the original.
- **Durations** — 120 / 140 / 160 / 400ms, from the `transition` declarations.
- **Control heights** — 30 / 26 / 24px, from `.btn`, `.chip-filter`, `.segmented button`.
- **Breakpoints** — 1240 / 1100 / 1080 / 900 / 720px, from the media queries.
- **Washes** — `oklch(1 0 0 / 5–9%)`, each mapped to the state that uses it.

Promotion changed no value. Where the source used a number inline, the token
records that number exactly.

---

## 3. Assets

**Icons.** The set lives inline in `assets/board-data.js` as an `ICON` map of
path fragments plus an `icon(name, size)` renderer. It was extracted two ways,
both mechanically:

- `build/icons.js` — the map and renderer, verbatim, as a reusable module with
  a `bdHydrateIcons()` helper matching how the screens hydrate `[data-icon]`.
- `assets/icons/*.svg` — 27 standalone files generated from that map, plus
  `assets/icons/manifest.json` recording the shared drawing contract.

No icon was redrawn, added or removed.

**Brand mark.** The `bd` mark is CSS, not an image: a 24px rounded square with
`linear-gradient(160deg, var(--primary-text), var(--primary-hover))` and mono
600 lettering. It is reproduced as CSS in the preview and UI kit rather than
rasterised, because that is what the source ships.

**Fonts.** Geist and Geist Mono are loaded from Google Fonts. No font binaries
existed in the evidence, so none are vendored; `fonts/geist.css` reproduces the
exact request and records the axis ranges and the `cv01/cv03/ss01` feature set.

---

## 4. Gaps — what the evidence does not contain

Stated rather than invented:

- **No light theme.** `color-scheme: dark` is global and no light values exist.
  The system is documented as dark-only.
- **No app icon, tray icon, installer artwork or favicon.** The source data
  contains an *open* bead about this — `bdb-p2m`, *"Replace the scaffold icons
  with project artwork"* — so the project itself has not produced them yet.
  `build/` therefore holds the runtime icon module only; there is no
  `build/icon.png`, and inventing one would misrepresent the project.
- **No photographic imagery, illustration or avatar images.** By design: the
  avatar is a monogram, and `index.html` states why.
- **No font binaries.** CDN-loaded, as above.
- **No mobile layout.** The narrowest breakpoint in the evidence is 720px and it
  only reflows the project grid. The board keeps four columns at every width.
- **No error, loading or toast surface.** One bead (`bdb-e8s`) mentions a toast
  stack, but no toast styling exists in the CSS. Not documented, not invented.
- **No colour values for `deferred` as a column.** `deferred` maps to the `open`
  column with a badge; it has no hue of its own.

---

## 5. Generated in this package

Everything below is new, and derived only from the evidence above.

| Artifact | Derivation |
| --- | --- |
| `DESIGN.md` | Written from the seven source files; every rule cites what proves it |
| `colors_and_type.css` | Colour + type tokens lifted from `bd-dark.css`, comments preserved |
| `tokens.css` | Declared tokens plus the measured scales in §2 |
| `fonts/geist.css` | The `<head>` request from the four screens |
| `build/icons.js` | The `ICON` map + renderer from `board-data.js` |
| `assets/icons/` | Generated from `build/icons.js` |
| `preview/*.html` | Review cards; the applied-surface card iframes the real screens |
| `ui_kits/app/*.html` | Applied kit built on `assets/bd-dark.css` + `assets/board-data.js`, so it renders the real component rules against the real dataset |
| `README.md`, `SKILL.md` | Orientation and agent instructions for the above |
