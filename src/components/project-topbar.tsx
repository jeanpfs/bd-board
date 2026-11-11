import { Link, useParams, useSearch } from '@tanstack/react-router'
import { useQuery } from '@tanstack/react-query'
import { ChevronRight } from 'lucide-react'

import { ProjectChip } from '@/components/project-chip'
import { getBeads, getProjects } from '@/lib/server'
import { isReady } from '@/lib/sort'
import { mapStatus } from '@/lib/types'

import type { ProjectTab } from '@/components/board-header'

const TAB_LABEL: Record<ProjectTab, string> = {
  overview: 'Overview',
  board: 'Board',
  hierarchy: 'Hierarchy',
  knowledge: 'Knowledge',
}

/**
 * Where you are inside a project: `ledger › Board` plus a one-line summary.
 * The project's views are in the sidebar; the Overview has its own title.
 */
export function ProjectTopbar() {
  const { project } = useParams({ strict: false })
  const search = useSearch({ strict: false })
  const tab = search.tab ?? 'overview'

  const projectsQuery = useQuery({
    queryKey: ['projects'],
    queryFn: () => getProjects(),
    refetchInterval: 15000,
    staleTime: 5000,
    enabled: Boolean(project),
  })
  // Shares the board's cache; the board owns retries and error display.
  const beadsQuery = useQuery({
    queryKey: ['beads', project],
    queryFn: () => getBeads({ data: { project: project! } }),
    enabled: Boolean(project),
    staleTime: 3000,
    retry: false,
  })

  if (!project || tab === 'overview') {
    return null
  }

  const projects = projectsQuery.data ?? []
  const index = projects.findIndex((p) => p.id === project)
  const name = projects[index]?.name ?? project
  const beads = beadsQuery.data
  const open = beads?.filter((b) => {
    const column = mapStatus(b).column
    return column === 'open' || column === 'blocked'
  }).length
  const ready = beads?.filter(isReady).length

  return (
    <header className="flex h-12 shrink-0 items-center gap-4 border-b border-border bg-background px-4">
      <nav
        aria-label="Breadcrumb"
        className="flex min-w-0 items-center gap-1.5 text-body"
      >
        <Link
          to="/p/$project"
          params={{ project }}
          search={{ tab: 'overview' }}
          className="flex min-w-0 items-center gap-2 rounded text-muted-foreground outline-none hover:text-foreground focus-visible:ring-2 focus-visible:ring-ring/60"
        >
          <ProjectChip name={name} index={Math.max(index, 0)} />
          <span className="truncate">{name}</span>
        </Link>
        <ChevronRight
          className="size-3.5 shrink-0 text-faint"
          aria-hidden="true"
        />
        <span aria-current="page" className="font-semibold text-foreground">
          {TAB_LABEL[tab]}
        </span>
      </nav>
      {open !== undefined && ready !== undefined ? (
        <p className="truncate text-xs text-muted-foreground">
          {open} open · {ready} ready
        </p>
      ) : null}
    </header>
  )
}
