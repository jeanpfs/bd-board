import { useMemo } from 'react'
import { Link } from '@tanstack/react-router'
import { ChevronLeft, Plus, Search } from 'lucide-react'

import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'
import { cn } from '@/lib/utils'
import { isEpic, mapStatus } from '@/lib/types'

import type { Bead, BeadColumn } from '@/lib/types'

interface BoardHeaderProps {
  project: string
  beads: Bead[]
  search: string
  setSearch: (value: string) => void
  epicFilter: string
  setEpicFilter: (value: string) => void
  onCreate: () => void
}

const ALL_EPICS = '__all__'

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
  epicFilter,
  setEpicFilter,
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

  const epics = useMemo(
    () =>
      beads
        .filter(isEpic)
        .sort((a, b) => a.id.localeCompare(b.id)),
    [beads],
  )

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

        <div className="hidden items-center gap-x-3 gap-y-1 md:flex">
          {COUNT_META.map((m) => (
            <span key={m.key} className="inline-flex items-center gap-1.5 text-xs">
              <span className={cn('size-1.5 shrink-0 rounded-full', m.dot)} aria-hidden="true" />
              <span className="text-muted-foreground/80">{m.label}</span>
              <span className={cn('tabular-nums', m.text)}>{counts[m.key]}</span>
            </span>
          ))}
        </div>

        <div className="ml-auto flex flex-wrap items-center gap-2">
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

          <Select
            value={epicFilter || ALL_EPICS}
            onValueChange={(v) => setEpicFilter(v === ALL_EPICS ? '' : v)}
          >
            <SelectTrigger size="sm" className="h-8 w-44">
              <SelectValue placeholder="Épico" />
            </SelectTrigger>
            <SelectContent position="popper" align="end" className="max-w-72">
              <SelectItem value={ALL_EPICS}>Todos os épicos</SelectItem>
              {epics.map((epic) => (
                <SelectItem key={epic.id} value={epic.id}>
                  <span className="font-mono text-xs text-muted-foreground">{epic.id}</span>
                  <span className="ml-1.5 truncate">{epic.title}</span>
                </SelectItem>
              ))}
            </SelectContent>
          </Select>

          <Button size="sm" onClick={onCreate}>
            <Plus aria-hidden="true" />
            Nova bead
          </Button>
        </div>
      </div>
    </header>
  )
}
