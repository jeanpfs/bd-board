# bd · board

Kanban visual e dashboard multi-projeto para o issue tracker [`bd` (beads)](https://github.com/steveyegge/beads), com estética estilo Linear. Reescrita enxuta do `beads-web` usando **apenas TanStack Start + shadcn/ui** (sem backend Rust, sem binário único).

## Como funciona

- **Sem banco próprio.** Toda leitura/escrita passa pelo binário `bd` via *server functions* do TanStack Start (`createServerFn` → `node:child_process`).
- **Auto-descoberta de projetos.** Varre `~/Code/*/.beads/metadata.json` e cruza com `bd sql "SHOW DATABASES"` no servidor Dolt compartilhado. Cada projeto vira um card no dashboard.
- **Tempo real.** Polling do TanStack Query (8s no board, 15s no dashboard).

## Requisitos

- Node 20+ e `pnpm`
- `bd` 1.0+ no `PATH` (Homebrew) e o servidor Dolt rodando (modo shared-server)
- Projetos com `.beads/metadata.json` sob `~/Code` (configurável via `BD_ROOTS`)

## Rodar

```bash
pnpm install
pnpm dev          # http://localhost:3009
```

Variáveis opcionais:

- `BD_BIN` — caminho do binário `bd` (default: `bd`, fallback `/opt/homebrew/bin/bd`)
- `BD_ROOTS` — diretórios para descobrir projetos, separados por `:` (default: `~/Code`)

## Features

- **Dashboard** — todos os projetos com barra de status proporcional e contagens (Aberto / Em progresso / Bloqueado / Fechado).
- **Board kanban** — 4 colunas, ordenado por prioridade, com busca e filtro por épico.
- **Épicos em destaque** — cards de épico mostram barra de progresso das filhas (`x/N concluídas`) e pontos de status; o detalhe lista as sub-tarefas clicáveis.
- **Arrastar para mudar status** — drag pela alça (grip) move a bead entre colunas (otimista, com rollback em erro).
- **Detalhe em painel lateral** — descrição em markdown, critérios de aceitação, comentários (+ adicionar), troca de status, navegação épico ↔ filha.
- **Criar bead** — diálogo com título, descrição, tipo e épico pai.

## Stack

TanStack Start (React 19, Vite, Nitro) · TanStack Query · shadcn/ui (radix) · Tailwind v4 · @dnd-kit · react-markdown · Geist.

## Arquitetura

```
src/
  lib/
    types.ts      # tipos + mapeamento de status + colunas
    bd.ts         # shell-out no bd (server-only): discovery, list, show, counts, mutações
    server.ts     # server functions (getProjects, getBeads, getBeadDetailFn, ...)
  routes/
    __root.tsx        # shell (top-nav, providers, tema dark)
    index.tsx         # dashboard
    p.$project.tsx    # board kanban
  components/         # project-card, kanban-column, bead-card, epic-progress,
                      # bead-detail-sheet, create-bead-dialog, board-header, ...
```
