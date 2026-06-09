import { useMemo } from 'react'
import { Link } from '@tanstack/react-router'
import { ChevronLeft, Columns3, Layers, Plus, Search } from 'lucide-react'

import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { cn } from '@/lib/utils'
import { mapStatus } from '@/lib/types'

import type { LucideIcon } from 'lucide-react'
import type { Bead, BeadColumn } from '@/lib/types'

export type BoardView = 'status' | 'epic'

interface BoardHeaderProps {
  project: string
  beads: Bead[]
  search: string
  setSearch: (value: string) => void
  view: BoardView
  setView: (value: BoardView) => void
  onCreate: () => void
}

const VIEWS: { key: BoardView; label: string; icon: LucideIcon }[] = [
  { key: 'status', label: 'Status', icon: Columns3 },
  { key: 'epic', label: 'Épicos', icon: Layers },
]

const COUNT_META: { key: BeadColumn; label: string; dot: string; text: string }[] = [
  { key: 'open', label: 'Aberto', dot: 'bg-status-open', text: 'text-status-open' },
  { key: 'in_progress', label: 'Em progresso', dot: 'bg-status-progress', text: 'text-status-progress' },
  { key: 'blocked', label: 'Bloqueado', dot: 'bg-status-blocked', text: 'text-status-blocked' },
  { key: 'closed', label: 'Fechado', dot: 'bg-status-closed', text: 'text-status-closed' },
]

export function BoardHeader({
  project,
  beads,
  search,
  setSearch,
  view,
  setView,
  onCreate,
}: BoardHeaderProps) {
  const counts = useMemo(() => {
    const acc: Record<BeadColumn, number> = {
      open: 0,
      in_progress: 0,
      blocked: 0,
      closed: 0,
    }
    for (const b of beads) acc[mapStatus(b.status).column] += 1
    return acc
  }, [beads])

  return (
    <header className="flex flex-col gap-3 pb-4">
      <div className="flex flex-wrap items-center gap-x-3 gap-y-2">
        <Link
          to="/"
          className="inline-flex items-center gap-1 rounded-md text-sm text-muted-foreground outline-none transition-colors hover:text-foreground focus-visible:ring-2 focus-visible:ring-ring/60"
        >
          <ChevronLeft className="size-4" aria-hidden="true" />
          Projetos
        </Link>

        <span className="text-muted-foreground/40" aria-hidden="true">
          /
        </span>

        <div className="flex items-center gap-2">
          <h1 className="text-base font-medium tracking-tight text-foreground">
            {project}
          </h1>
          <span className="rounded-md bg-muted px-1.5 py-0.5 font-mono text-[0.7rem] leading-none text-muted-foreground tabular-nums">
            {beads.length}
          </span>
        </div>

        <div className="hidden items-center gap-x-3 gap-y-1 lg:flex">
          {COUNT_META.map((m) => (
            <span key={m.key} className="inline-flex items-center gap-1.5 text-xs">
              <span className={cn('size-1.5 shrink-0 rounded-full', m.dot)} aria-hidden="true" />
              <span className="text-muted-foreground/80">{m.label}</span>
              <span className={cn('tabular-nums', m.text)}>{counts[m.key]}</span>
            </span>
          ))}
        </div>

        <div className="ml-auto flex flex-wrap items-center gap-2">
          <div
            className="inline-flex items-center gap-0.5 rounded-md bg-muted/60 p-0.5"
            role="group"
            aria-label="Agrupar por"
          >
            {VIEWS.map((v) => {
              const Icon = v.icon
              const active = view === v.key
              return (
                <button
                  key={v.key}
                  type="button"
                  onClick={() => setView(v.key)}
                  aria-pressed={active}
                  className={cn(
                    'inline-flex items-center gap-1.5 rounded px-2 py-1 text-xs font-medium transition-colors outline-none focus-visible:ring-2 focus-visible:ring-ring/60',
                    active
                      ? 'bg-background text-foreground ring-1 ring-foreground/10 shadow-sm'
                      : 'text-muted-foreground hover:text-foreground',
                  )}
                >
                  <Icon className="size-3.5" aria-hidden="true" />
                  {v.label}
                </button>
              )
            })}
          </div>

          <div className="relative">
            <Search
              className="pointer-events-none absolute top-1/2 left-2.5 size-3.5 -translate-y-1/2 text-muted-foreground"
              aria-hidden="true"
            />
            <Input
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="Pesquisar…"
              className="h-8 w-44 pl-8 sm:w-56"
              aria-label="Pesquisar beads"
            />
          </div>

          <Button size="sm" onClick={onCreate}>
            <Plus aria-hidden="true" />
            Nova bead
          </Button>
        </div>
      </div>
    </header>
  )
}
