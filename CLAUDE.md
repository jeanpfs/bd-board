# Project Instructions

<!-- bd-doctor-divergence: ok -->

This project uses `bd` for task tracking. Run `bd prime` when workflow context is missing or stale.

## Commands

```bash
pnpm install
pnpm dev
pnpm typecheck
pnpm check
pnpm exec eslint --max-warnings=0
pnpm test
pnpm audit:prod
pnpm validate
```

## Development Rules

- Prefer `pnpm`.
- Keep the app local-first and explicit about write safety.
- Reads should work without extra configuration once `bd` and project discovery are available.
- Mutations must stay behind `BD_BOARD_ALLOW_WRITE=true`.
- Keep public documentation free of personal machine paths and private workflow notes.
- Use focused tests for parsing, status mapping, sorting, filtering, and server-function validation.

## Beads

- Create or update beads for durable task tracking.
- Do not use markdown TODO lists as a substitute for tracked work.
- Close completed beads before handoff when the work is actually complete.
