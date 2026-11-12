# Changelog

All notable changes to this project will be documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.0.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [Unreleased]

### Added

- Pending schema migrations are surfaced instead of failing silently. When a shared (remote-backed) database is behind the bd binary, bd refuses to migrate it on its own (only one clone may migrate). The dashboard card shows "Read-only · migration pending", the board shows bd's options (`migrate` vs `adopt`) with their commands, conditions and risks, and toasts show a one-line summary. bd board never runs a migration.
- Closing a bead asks for an optional reason (`bd close --reason`). When bd's close policy refuses (open children or an active blocker), the dialog shows bd's reason and offers **Close anyway** (`--force`). Dragging a card to Closed opens the same dialog when bd refuses.
- Custom statuses (`bd config set status.custom "in_review:wip,…"`) land in the column of their bd category (active → Open, wip → In progress, done → Closed, frozen → Open as deferred) with a badge naming the status, and dashboard counts follow the same rule. Previously they all showed as plain Open beads.
- Design-system foundations in `src/styles.css`: type roles (`text-badge` 11px floor, `text-body` 13px, `text-title` 18px, `text-metric` 26px, alongside Tailwind's `text-xs`/`text-sm`), a six-color project palette (`bg-project-1…6`, white initials ≥ 4.5:1) and layout spacing (`min-h-row`, `gap-section`, `px-page`, `w-rail`). New components: `Kbd`, `HoverCard` (shadcn, wired to `@/lib/utils`) and `ProjectChip`.
- **Project Overview** is the new landing view of a project: a one-line summary (open · in progress · closed this week), **Needs attention** (open P0s, blocked beads, in-progress beads with no update for 7+ days), epic progress, ready to pick up, in progress with assignees, and the latest decisions and learnings from Knowledge.
- Due dates, estimates and snooze (defer until a date) on beads, with overdue and due-soon indicators and a "due this week" board filter.
- Label chips with autocomplete in the bead detail.
- Relations editor in the bead detail: add blocks, blocked by, related, duplicates and supersedes links, and remove blocks, blocked by and related links.
- Command palette (`Cmd/Ctrl+K`) to jump to beads, projects and actions.
- Keyboard shortcuts for board navigation and bead editing, with a `?` help dialog.
- Ready view with a Claim action, using `bd ready --explain`.
- Agents panel with leases, heartbeats, human gates (reclaim and resolve) and agent pools.
- Inbox and My work screens built from the bd events journal.
- Project settings: general, custom statuses, agent pools and integrations.
- Linear integration settings (team, API key, direction, mappings).
- Saved views (project and personal) with filter, grouping and sort.
- List view with grouping and bulk actions.
- Epics timeline.
- Insights screen with throughput, cycle time and burn-up.

### Changed

- **Deleting a bead deletes only it and its subtasks.** The board used `bd delete --cascade`, which in bd ≤ 1.3.4 also follows `blocks`/`related` edges, so deleting a blocker deleted the work it blocked. It now deletes the explicit parent-child subtree with `--force`; beads that only depended on it are kept, and the confirmation lists them under "Kept, link removed".
- Development pins bd 1.3.4 (`mise.toml`); CI's feed smoke test also runs against 1.3.4. 1.3.0 stays the minimum.
- Dashboard discovery probes up to four projects in parallel.
- Every hard-coded text size (`text-[9px]` … `text-[28px]`, 116 places) now uses a type role. Text under 11px is gone, so priority badges, ids and avatar initials read slightly larger.
- **Home** answers "what needs me" across all projects: one **Needs you** list (open P0s, blocked or stale beads, missing folders, pending migrations, each with an action), lean project cards ordered by urgency (one headline number, full counts on hover), **My work** for the chosen assignee, and **Recently updated**. The four summary tiles and the per-card progress ring and legend are gone.
- **Sidebar**: a project switcher at the top replaces the logo row and, inside a project, the projects list; the project's views (Overview, Board, Hierarchy, Knowledge) moved from the header tabs into the sidebar; the signed-in assignee and the collapse toggle sit in the footer. Group labels are plain text instead of uppercase mono.
- The project header is a breadcrumb (`ledger › Board`) with a short summary; the Overview carries its own title instead.

### Fixed

- Projects with more than 50 beads were truncated; the board now lists every bead (`--limit 0`).
- The desktop app never built bead links, so blockers and related beads on cards and the Ready view were wrong; it now derives them like the web runtime.
- Web bead edits (title, description, labels, due, estimate) failed with "No bead updates provided".
- Deferred (snoozed) beads were counted as ready.
- Changing status from the bead detail panel no longer fails silently; errors show a toast.
- bd errors reported as JSON on stderr are shown as their message instead of raw JSON.
- Project actions menu (⋮) on dashboard cards and in the sidebar now opens. The trigger sat inside the project link and called `preventDefault()`, which Radix treats as "don't toggle"; it now renders beside the link. Dashboard cards for missing or broken projects also get the menu, so the path can be fixed or the project removed.
- Dashboard project cards stack header, progress bar and status legend vertically again; the legend no longer overflows the card.
- Web build: opening a project whose folder was removed shows `project directory no longer exists: <path>` right away, instead of a skeleton for ~8 s followed by a misleading `bd not found`. The sidebar's beads query no longer retries behind the board's back.
- Board toolbar: the sort button reads "Sort: <key>", so it is no longer a second "Priority" button next to the priority filter. Swimlane toggles are labelled in English ("Collapse lane" / "Expand lane").

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
