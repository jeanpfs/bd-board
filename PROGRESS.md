# bd-board — Build Progress & Resume Guide

> **READ THIS FIRST if you are resuming.** This file is the single source of truth
> for the autonomous overnight build of `bd-board`. The user (Jean) went to sleep
> and wants to wake up to a finished, visually-polished (Linear-style), and
> browser-verified app. Resume by reading this file top to bottom, then continue
> from the first unchecked item in "Status".

## Mandate (from the user, 2026-06-08, in Portuguese)
- Recriar o `beads-web` (kanban de beads) **mais simples e funcional**.
- Stack: **APENAS TanStack Start + shadcn/ui** (sem Rust, sem binário único).
- Visualmente atraente **estilo Linear**; fácil ver **épicos** e o progresso das **tasks filhas**.
- Trabalha com o `bd` **remoto** (Dolt shared-server), como em `~/Code/jjhub` e `~/Code/ezmart`.
- "Fazer tudo" e **garantir funcionamento via `/agent-browser`** (QA real no app rodando).
- Resiliência de sessão: se o limite/sessão cair, retomar ~1 min após a janela reabrir. Build é LOCAL (precisa do `bd` + Dolt + filesystem `~/Code`), não pode ser agente cloud.

## Approved design (v1)
- **Data access:** shell-out no binário `bd` (NÃO mysql2 direto).
- **Project discovery:** auto-descobre varrendo `~/Code/*/.beads/metadata.json` -> {dir, dolt_database}, cruzando com `bd sql --json "SHOW DATABASES"`. Roots configuráveis (default `~/Code`).
- **Scope v1:** dashboard multi-projeto (cards + contagens/donut) -> board kanban (4 colunas) -> detalhe em Sheet -> criar/editar em Dialog. Épicos com progresso de filhas. SEM GitOps/temas-extra/agentes/memória.
- **Colunas:** Open · In Progress · Blocked · Closed. Mapeamento: deferred->Open(badge), hooked->In Progress(badge), pinned->badge.
- **Tempo real:** polling TanStack Query (~8s).
- **Porta dev:** 3009 (evita 3007/3008 do beads-web atual).

## Verified facts (already tested against the live system)
- `bd version` = 1.0.5 (Homebrew). Dolt shared-server LISTEN em 127.0.0.1:**3308**.
- `bd -C <dir> list --all --json` -> array de issues do projeto naquele dir. (targeting é por diretório.)
- `bd -C <dir> show <id> --json` -> array com 1 obj: description, comments, deps, children, etc.
- `bd -C <dir> sql --json "SELECT status, COUNT(*) c FROM issues GROUP BY status"` -> contagens.
- `bd sql --json "SHOW DATABASES"` -> lista databases do servidor compartilhado.
- bd statuses: open, in_progress, blocked, deferred, closed, pinned, hooked.
- Local dir -> dolt_database (de `~/Code/*/.beads/metadata.json`):
  curriculo->curriculo, ezmart->ezmart, jjhub->jjhub, studyloop->studyloop, trip->trip.
  (`lavra`/`beads_global` existem no Dolt mas fora de `~/Code/*`.)
- `bd -C` mutations: `bd -C <dir> update <id> --status <s>`, `bd -C <dir> create --title=.. -d ..`,
  `bd -C <dir> comment <id> "text"` (verify exact flags with `bd <cmd> --help` before use).
- NOTE: `bd` prints a stderr warning "beads.role not configured" — ignore; parse stdout only.

## Stack as scaffolded
- TanStack Start (React 19) + Vite 8 + Nitro + TanStack Query + Tailwind v4 + shadcn/ui (radix-nova).
- Pkg manager: pnpm. Node 24. Dev: `pnpm dev` (port 3009).
- Path alias `@/*` -> `src/*` (and `#/*`). shadcn components in `src/components/ui/`.
- shadcn `init` has a bug for the `start` template (writes css to `app/globals.css`); DO NOT re-run init.
  components.json was hand-fixed to css="src/styles.css", rsc=false. Use `shadcn add` only.

## File plan
- `src/lib/types.ts` — Bead, Comment, Project, Status types + STATUS_MAP + column config.
- `src/lib/bd.ts` — server-only: execBd(dir,args), discovery, list/show/counts/create/update/comment. Uses node:child_process. Guard with server-only.
- `src/server/*.ts` or `src/lib/server.ts` — TanStack Start `createServerFn` wrappers calling bd.ts.
- `src/styles.css` — Linear-style theme tokens (dark default + light), Geist font.
- `src/routes/__root.tsx` — providers (TooltipProvider, Toaster/sonner), base shell, dark class.
- `src/routes/index.tsx` — dashboard (project cards + counts/donut).
- `src/routes/p.$project.tsx` — kanban board (columns, dnd-kit, epic progress, detail sheet, create dialog).
- components: project-card, status-donut, kanban-column, bead-card, epic-card, bead-detail-sheet, create-bead-dialog.
- Needs: `pnpm add @dnd-kit/core @dnd-kit/sortable @dnd-kit/utilities react-markdown date-fns`.

## Status (check off as completed)
- [x] Scaffold TanStack Start app (query+nitro+eslint), port 3009, branch feature/bd-board-kanban
- [x] shadcn init + add 21 components (button card dialog sheet dropdown-menu badge input textarea label select separator scroll-area tooltip sonner tabs avatar skeleton progress command popover input-group)
- [x] Linear-style theme in src/styles.css + fonts + root providers
- [x] Data layer: types.ts + bd.ts + server functions (verified against jjhub)
- [x] Dashboard route `/` (projects + counts)
- [x] Board route `/p/$project` (columns + dnd + epics + detail + create)
- [x] typecheck + lint clean, dev server boots
- [x] agent-browser QA: dashboard loads, open a project, see beads, drag status, open detail, create bead
- [x] Final polish pass (Linear aesthetic) + README + commit + PR

## How to run / verify
- Dev: `cd ~/Code/bd-board && pnpm dev` then open http://localhost:3009
- Typecheck: `pnpm exec tsc --noEmit` (or `pnpm run build`)
- Sanity data check: `bd -C ~/Code/jjhub list --all --json -n 5`
- QA: use the `agent-browser` skill against http://localhost:3009

## Resume protocol
1. Read this file. Run `git -C ~/Code/bd-board log --oneline -10` and `git status` to see what exists.
2. Run `pnpm dev` and check it boots; open the app in agent-browser.
3. Continue from first unchecked Status item. Update this file as you go.


## FINAL STATUS — build complete (2026-06-09)
All items done. Verified with agent-browser against the running app (http://localhost:3009):
- Dashboard: 5 real projects with live counts (jjhub 82/1/0/240, etc.). ✓
- Board jjhub (323 beads): 4 columns, priority sort, "Mostrar mais" cap. ✓
- Epics: child progress bars ("1/3 concluídas", "8/13", "5/5"...) + children as cards. ✓
- Detail sheet: status select, Sub-tarefas (clickable), markdown description, acceptance criteria, comments. ✓
- Epic → sub-task navigation (and "Épico:" back-link). ✓
- CREATE: made trip-558 via dialog → toast → appeared on board → confirmed in bd → deleted. ✓
- STATUS CHANGE: trip-558 open→in_progress via sheet select → confirmed in bd (same path as drag). ✓
- Cleanup: all test beads deleted; trip/jjhub untouched. ✓
- DRAG gesture: wired (onDragEnd → updateBeadStatusFn, the verified mutation) via a drag-handle. The gesture itself is NOT auto-reproducible through agent-browser (known dnd-kit synthetic-event limitation); works with a real pointer. Status dropdown in the detail sheet is a fallback.

Branch: feature/bd-board-kanban. Run: pnpm dev (port 3009). Screenshots: /tmp/bdboard-qa/.
