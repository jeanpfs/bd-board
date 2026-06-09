# Contributing

Thanks for helping improve `bd-board`.

## Local Setup

```bash
pnpm install
cp .env.example .env.local
pnpm dev
```

`bd-board` is a local-first app. Reads are enabled by default. Mutations are disabled unless `BD_BOARD_ALLOW_WRITE=true` is set.

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

## Pull Requests

- Keep changes focused and small enough to review.
- Add or update tests when changing parsing, sorting, status mapping, or server-function behavior.
- Update `README.md` when changing setup, environment variables, or user-facing behavior.
- Do not commit local `.env*`, generated build output, or personal machine paths.
