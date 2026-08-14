# Security Policy

`bd-board` shells out to the local `bd` CLI and can mutate issue data; writes are always enabled. Treat it as a trusted local development tool, not as a multi-user hosted service.

## Supported Usage

- Run it on localhost or a trusted private network only.
- Do not expose the dev or preview server directly to the public internet.
- Anyone who can reach the app (browser or desktop shell) can create, edit, and delete beads in the configured project roots.

## Reporting a Vulnerability

Open a private security advisory on GitHub when available. If that is not possible, open an issue with a minimal description and avoid posting exploit details or private repository paths.

Include:

- Affected version or commit.
- Environment and operating system.
- Reproduction steps.
- Expected and actual behavior.
