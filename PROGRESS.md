# Project Status

This file tracks public release readiness for `bd-board`.

## Current Scope

- Local-first dashboard for bead-enabled repositories.
- Reads and writes through the local `bd` CLI, enabled by default.
- TanStack Start, React, TanStack Query, Tailwind CSS, and shadcn/ui.

## Launch Checklist

- Repository metadata and license are present.
- Contribution, security, and conduct docs are present.
- `pnpm validate` checks formatting, lint, typecheck, tests, and production audit.
- Unit tests cover status mapping, sorting/filtering, and server input validation.
- README documents setup, configuration, commands, architecture, and safety model.

## Known Limitations

- The app is intended for local use, not public hosting.
- Large boards may need list virtualization if repositories grow beyond the current rendering profile.
- Mutations depend on the exact behavior of the installed local `bd` CLI.
- The default icons are generated scaffold assets and can be replaced by project-specific artwork later.
