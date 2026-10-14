# Contributing

Thanks for helping improve `bd-board`.

## Local Setup

```bash
pnpm install
cp .env.example .env.local
pnpm dev
```

`bd-board` is a local-first app. Reads and mutations are both enabled by default; it shells out directly to your local `bd` CLI.

## Desktop App (Tauri)

```bash
pnpm desktop:dev      # run the Tauri desktop app in development
pnpm desktop:build    # build the desktop bundle (needs the Rust toolchain)
```

Browser and desktop end-to-end suites: `pnpm e2e:browser`, `pnpm e2e` (after `pnpm e2e:build`) and `pnpm e2e:feed`.

## Quality Gates

Run the full local gate before opening a pull request:

```bash
pnpm validate
```

For focused checks:

```bash
pnpm typecheck
pnpm check
pnpm exec eslint --max-warnings=0
pnpm test
pnpm audit:prod
```

If `pnpm audit:prod` fails on a transitive dependency, update it (`pnpm update <pkg> --depth Infinity`) or add an entry under `overrides` in `pnpm-workspace.yaml`.

## Pull Requests

- Keep changes focused and small enough to review.
- Add or update tests when changing parsing, sorting, status mapping, or server-function behavior.
- Update `README.md` when changing setup, environment variables, or user-facing behavior.
- Do not commit local `.env*`, generated build output, or personal machine paths.
