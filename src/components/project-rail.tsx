import { Link, useParams, useSearch } from '@tanstack/react-router'
import { useQuery } from '@tanstack/react-query'
import { BookOpen, Columns3, Folder } from 'lucide-react'

import { AppIcon } from '@/components/app-icon'
import { cn } from '@/lib/utils'
import { getBeads, getProjects, isDesktopApp } from '@/lib/server'
import { isReady } from '@/lib/sort'
import { mapStatus } from '@/lib/types'

import type { LucideIcon } from 'lucide-react'

function RailGroup({
  label,
  children,
}: {
  label: string
  children: React.ReactNode
}) {
  return (
    <nav className="flex flex-col gap-1 px-3" aria-label={label}>
      <p className="px-2 font-mono text-[10px] font-medium tracking-[0.09em] text-faint uppercase">
        {label}
      </p>
      <ul className="flex flex-col gap-0.5">{children}</ul>
    </nav>
  )
}

function RailLink({
  to,
  params,
  search,
  icon: Icon,
  active,
  dotClassName,
  count,
  children,
}: {
  to: string
  params?: Record<string, string>
  search?: Record<string, string>
  icon?: LucideIcon
  active?: boolean
  dotClassName?: string
  count?: number
  children: React.ReactNode
}) {
  return (
    <li>
      <Link
        to={to}
        params={params}
        search={search}
        aria-current={active ? 'page' : undefined}
        className={cn(
          'flex h-7 items-center gap-2 rounded-md px-2 text-[13px] text-muted-foreground outline-none transition-colors focus-visible:ring-2 focus-visible:ring-ring/60',
          active
            ? 'bg-foreground/8 text-foreground ring-1 ring-inset ring-border'
            : 'hover:bg-foreground/6 hover:text-foreground',
        )}
      >
        {Icon ? (
          <Icon className="size-3.5 shrink-0" aria-hidden="true" />
        ) : dotClassName ? (
          <span
            className={cn('size-1.5 shrink-0 rounded-full', dotClassName)}
            aria-hidden="true"
          />
        ) : null}
        <span className="min-w-0 flex-1 truncate">{children}</span>
        {count !== undefined ? (
          <span className="shrink-0 font-mono text-[11px] tabular-nums text-faint">
            {count}
          </span>
        ) : null}
      </Link>
    </li>
  )
}

export function ProjectRail() {
  const { project } = useParams({ strict: false })
  const search = useSearch({ strict: false })
  const tab = search.tab ?? 'board'

  const projectsQuery = useQuery({
    queryKey: ['projects'],
    queryFn: () => getProjects(),
    refetchInterval: 15000,
    staleTime: 5000,
  })
  const projects = projectsQuery.data ?? []

  const beadsQuery = useQuery({
    queryKey: ['beads', project],
    queryFn: () => getBeads({ data: { project: project! } }),
    enabled: Boolean(project),
    refetchInterval: 8000,
    staleTime: 3000,
  })
  const beads = project ? (beadsQuery.data ?? []) : []
  const readyCount = beads.filter(isReady).length
  const blockedCount = beads.filter(
    (b) => mapStatus(b.status).column === 'blocked',
  ).length

  return (
    <aside className="flex w-[232px] shrink-0 flex-col overflow-hidden bg-sidebar">
      <div className="flex h-12 shrink-0 items-center gap-2 px-3">
        <Link
          to="/"
          aria-label="bd board home"
          className="flex items-center gap-2 outline-none focus-visible:ring-2 focus-visible:ring-ring/60"
        >
          <AppIcon className="size-6 rounded-md" />
          <span className="text-sm font-semibold tracking-tight text-foreground">
            bd board
          </span>
        </Link>
      </div>

      <div className="flex min-h-0 flex-1 flex-col gap-4 overflow-y-auto py-3">
        <RailGroup label="Projects">
          {projects.map((p) => (
            <RailLink
              key={p.database}
              to="/p/$project"
              params={{ project: p.database }}
              icon={Folder}
              active={p.database === project}
              count={p.counts.total}
            >
              {p.name}
            </RailLink>
          ))}
        </RailGroup>

        {project ? (
          <>
            <RailGroup label="View">
              <RailLink
                to="/p/$project"
                params={{ project }}
                search={{ tab: 'board' }}
                icon={Columns3}
                active={tab === 'board'}
              >
                Board
              </RailLink>
              <RailLink
                to="/p/$project"
                params={{ project }}
                search={{ tab: 'knowledge' }}
                icon={BookOpen}
                active={tab === 'knowledge'}
              >
                Knowledge
              </RailLink>
            </RailGroup>

            <RailGroup label="Quick filters">
              <RailLink
                to="/p/$project"
                params={{ project }}
                search={{ ready: '1' }}
                dotClassName="bg-status-closed"
                count={readyCount}
              >
                Ready
              </RailLink>
              <RailLink
                to="/p/$project"
                params={{ project }}
                search={{ view: 'status' }}
                dotClassName="bg-status-blocked"
                count={blockedCount}
              >
                Blocked
              </RailLink>
            </RailGroup>
          </>
        ) : null}
      </div>

      <div className="flex h-9 shrink-0 items-center gap-1.5 px-3 font-mono text-[11px] text-faint">
        <span>{isDesktopApp() ? 'desktop' : 'web'}</span>
      </div>
    </aside>
  )
}
