# Project Instructions

This project uses `bd` for task tracking in shared-server mode. Keep tracker data, local agent configuration, and runtime state out of the repository.

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

`bd` runs against the shared Dolt server at `~/Code/jeanpfs-ai/beads/shared-server`, using the `bd_board` database. The repository must not track `.beads/`, `.agents/`, `.claude/`, `.codex/`, exported JSONL files, local Dolt runtime files, or agent hooks.

Use `bd config list` to confirm shared-only settings before handoff:

```bash
bd config list
```

Expected local settings:

- `dolt.shared-server = true`
- `export.auto = false`
- `export.git-add = false`
- `import.auto = false`
- `no-git-ops = true`

Create, update, and close beads through the remote/shared database only. Do not commit tracker snapshots or local agent state.
