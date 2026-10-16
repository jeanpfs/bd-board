# Changelog

All notable changes to this project will be documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.0.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [Unreleased]

## [0.1.1] - 2026-10-16

### Security

- Upgrade the TanStack Start and Router packages together (`@tanstack/react-start` 1.169.2, `@tanstack/react-router` 1.170.44, plus router-ssr-query, router-plugin, router-cli and react-query). This clears three critical advisories: unauthenticated reflected XSS in server-function responses.

### Fixed

- Web build: opening the app in a browser no longer shows the "Repair Project" dialog for every registered project. Path validation is a desktop-app command and always failed in the browser, which was treated as an invalid path.

### Docs

- README demo GIF, and the scripts used to record it (`scripts/demo/`).

## [0.1.0] - 2026-10-15

### Added

- Live updates via `bd events tail --follow`. The board enables the events journal automatically when it is off (`bd config set events-journal true`) and refetches on journal records plus a 60 s safety refetch; it polls every 8 s only while connecting or after a feed error.
- **Breaking:** bd 1.3.0 or newer is now required.
- Feed integration smoke test (`scripts/feed-smoke.ts`) with CI job that runs against bd 1.3.0 and latest, validating disabled → live → change message flow.
- `mise.toml` for pinned development tool versions (Node.js 24.14.0, pnpm 11.21.0, bd 1.3.0).

### Fixed

- Web build now loads `~/.config/bd-board/projects.json` correctly using `node:fs/promises` instead of Tauri fs plugin, enabling project registration in web deployments.

### Removed

- Unused `@tauri-apps/plugin-fs` dependency.
