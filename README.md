# bd board

Visual kanban board and multi-project dashboard for [`bd` (beads)](https://github.com/steveyegge/beads).

`bd-board` is intentionally local-first: it discovers bead-enabled repositories on disk, reads data through the local `bd` CLI, and renders a fast dashboard for day-to-day planning. It now also has an early Tauri desktop shell spike so the same UI can run outside the browser.

## Features

- Multi-project dashboard with live status counts.
- Board view grouped by status or by epic swimlanes.
- Priority filtering, text search, and sort controls with URL state.
- Epic progress from child beads.
- Bead detail modal with markdown description, acceptance criteria, comments, parent and child navigation.
- Drag-and-drop status updates with mouse and keyboard sensors.
- Optional write mode for creating beads, adding comments, and changing status.

## Requirements

- Node.js 20+.
- pnpm 10+.
- `bd` 1.0+ available on `PATH`.
- Repositories with `.beads/metadata.json` under the configured roots.

## Setup

```bash
pnpm install
cp .env.example .env.local
pnpm dev
```

Open http://localhost:3009.

Desktop spike:

```bash
pnpm install
pnpm desktop:dev
```

## Configuration

Environment variables:

- `BD_BIN`: path to the `bd` binary. Defaults to `bd`, with `/opt/homebrew/bin/bd` as a fallback.
- `BD_ROOTS`: platform-delimited directories to scan for bead projects. Defaults to `~/Code`.
- `BD_BOARD_ALLOW_WRITE`: set to `true`, `1`, or `yes` to enable create, comment, and status update mutations.

The desktop shell uses the same `BD_BIN` and `BD_ROOTS` configuration.

Reads are enabled by default. Writes are disabled by default because this app executes local `bd` mutations.

## Commands

```bash
pnpm dev
pnpm typecheck
pnpm check
pnpm exec eslint --max-warnings=0
pnpm test
pnpm audit:prod
pnpm validate
```

## Architecture

```text
src/
  lib/
    bd.ts                 local bd CLI adapter
    server.ts             TanStack Start server functions
    server-validation.ts  server-function input validation
    sort.ts               filtering and sorting helpers
    types.ts              bead/project types and status mapping
  routes/
    __root.tsx            app shell
    index.tsx             project dashboard
    p.$project.tsx        board route
  components/
    board-header.tsx
    board-swimlanes.tsx
    kanban-column.tsx
    bead-card.tsx
    bead-detail-modal.tsx
    create-bead-dialog.tsx
```

The app does not store its own database. It shells out to `bd` with `node:child_process` and parses JSON output.

## Safety Model

`bd-board` is not designed as a hosted multi-tenant app. Run it locally, bind it only to trusted interfaces, and keep `BD_BOARD_ALLOW_WRITE` disabled unless you want the UI to mutate local bead data.

## License

MIT
