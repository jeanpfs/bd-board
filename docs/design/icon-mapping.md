# Icon mapping — Open Design dark system → lucide-react

The vendored package (`docs/design/bd-board-dark-system/assets/icons/`) ships
27 of its own monoline SVGs. This app already uses `lucide-react` everywhere
(see `components.json` → `iconLibrary: "lucide"`), so the reskin reuses that
set instead of importing a second icon system — the package's own `DESIGN.md`
lists "a second icon family" as an anti-pattern to avoid, and that applies to
this app just as much as to the prototype itself.

Names are from `assets/icons/manifest.json`. "Existing usage" notes where the
lucide icon is already imported in this codebase, so the mapping stays
consistent instead of introducing a second import for the same glyph.

| Design icon | lucide-react   | Existing usage                                          |
| ------------ | -------------- | -------------------------------------------------------- |
| `chevron`    | `ChevronDown`  | disclosure chevrons (lane collapse), rotated via CSS      |
| `chevronRight` | `ChevronRight` | —                                                       |
| `chevronLeft`  | `ChevronLeft`  | `board-header.tsx`                                      |
| `search`     | `Search`       | `board-header.tsx`, `project-knowledge-panel.tsx`         |
| `plus`       | `Plus`         | `board-header.tsx`                                       |
| `layers`     | `Layers`       | `bead-card.tsx` (Epic badge)                              |
| `columns`    | `Columns3`     | `board-header.tsx`                                       |
| `book`       | `BookOpen`     | `board-header.tsx`, `project-knowledge-panel.tsx`         |
| `folder`     | `Folder`       | generic project/repo scoping (distinct from the brand's `FolderKanban` in `top-nav.tsx`) |
| `sliders`    | `SlidersHorizontal` | `board-header.tsx`                                   |
| `sort`       | `ArrowUpDown`  | `board-header.tsx`                                        |
| `tree`       | `ListTree`     | `bead-card.tsx` (subtask count) — same glyph, hierarchy semantics |
| `ban`        | `Ban`          | `bead-card.tsx` (blocked-by)                              |
| `waypoints`  | `Waypoints`    | `bead-card.tsx` (blocking)                                |
| `link`       | `Link2`        | `bead-card.tsx` (related)                                 |
| `comment`    | `MessageSquare`| `bead-card.tsx` (comment count), `project-knowledge-panel.tsx` |
| `check`      | `Check`        | —                                                          |
| `clock`      | `Clock`        | —                                                          |
| `pencil`     | `Pencil`       | —                                                          |
| `trash`      | `Trash2`       | —                                                          |
| `corner`     | `CornerDownRight` | parent/source-bead links (knowledge row, detail sheet) |
| `align`      | `Copy`         | re-targeted: the source uses its `align` glyph for a "Copy raw" button — `Copy` is the semantically correct icon here, not a literal shape match |
| `circleCheck`| `CircleCheck`  | —                                                          |
| `x`          | `X`            | —                                                          |
| `lock`       | `Lock`         | —                                                          |
| `bolt`       | `Zap`          | —                                                          |
| `dot`        | *(none — not an icon)* | status dots are already a styled `<span>` with a `rounded-full` background in the current status labels; keep that convention instead of an SVG glyph |

All 27 names above resolved to an existing `lucide-react` export in the
installed version (`0.545.0`) — no gaps, no new dependency needed.
