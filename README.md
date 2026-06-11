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

Web development:

```bash
pnpm install
cp .env.example .env.local
pnpm dev
```

Open http://localhost:3009.

Desktop development:

```bash
pnpm install
pnpm desktop:dev
```

## Desktop App

The desktop app is a Tauri v2 shell around the same React/TanStack UI. It is
intended for local use only: it reads bead projects from your machine and calls
the local `bd` binary through Tauri commands.

Desktop data flow:

- Web mode uses TanStack Start server functions and the local `bd` adapter.
- Desktop mode uses Tauri commands for read-only project discovery, board data,
  bead details, comments, and knowledge.
- Desktop writes are not enabled yet, even if web write mode is configured.
- No bead database, `.beads` data, or Lavra memory is bundled into the app.

Desktop packaging:

```bash
pnpm desktop:prepare
pnpm desktop:build
```

`pnpm desktop:prepare` builds the TanStack Start app in SPA mode, copies the
generated `.output/public` assets into the repo-root `dist/`, and writes
`dist/index.html` from the generated `_shell.html`. This matters because Tauri
serves `frontendDist` as static assets; packaging a handmade `index.html` with
only the client script leaves the installed app on a blank screen.

Tauri is configured with:

```json
"frontendDist": "../dist"
```

The path is relative to `src-tauri/tauri.conf.json`, so the installed app embeds
the repo-root `dist/` directory.

On macOS, the release build writes:

```text
src-tauri/target/release/bundle/macos/bd board.app
src-tauri/target/release/bundle/dmg/bd board_0.1.0_aarch64.dmg
```

Windows packaging is part of the Tauri roadmap for this project, but the current
verified artifact is the macOS build.

Desktop troubleshooting:

- If the app opens but shows no projects, check that `bd` is available on
  `PATH` or set `BD_BIN`.
- If projects live outside `~/Code`, set `BD_ROOTS` to the directories to scan.
- If the desktop bridge fails, the home page shows a diagnostic card. When the
  bridge is healthy, that card stays hidden.
- If the installed app opens to a blank screen, rerun `pnpm desktop:build` and
  confirm `dist/index.html` exists and was generated from `_shell.html`.

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
pnpm desktop:prepare
pnpm desktop:build
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
scripts/
  prepare-desktop-build.mjs
src-tauri/
  tauri.conf.json
  src/
    desktop.rs
    lib.rs
```

The app does not store its own database. It shells out to `bd` with `node:child_process` and parses JSON output.

## Safety Model

`bd-board` is not designed as a hosted multi-tenant app. Run it locally, bind it only to trusted interfaces, and keep `BD_BOARD_ALLOW_WRITE` disabled unless you want the UI to mutate local bead data.

## License

MIT
