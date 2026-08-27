import { useEffect, useMemo, useState } from 'react'
import { Link, useParams } from '@tanstack/react-router'
import { useQuery } from '@tanstack/react-query'
import { ChevronsLeft, ChevronsRight, Folder, Home, X } from 'lucide-react'

import { AppIcon } from '@/components/app-icon'
import { Button } from '@/components/ui/button'
import { cn } from '@/lib/utils'
import { getBeads, getProjects } from '@/lib/server'
import { getStoredIdentity, setStoredIdentity } from '@/lib/identity'
import {
  getStoredSidebarCollapsed,
  setStoredSidebarCollapsed,
} from '@/lib/sidebar-collapse'
import { isReady } from '@/lib/sort'
import { mapStatus } from '@/lib/types'

import type { LucideIcon } from 'lucide-react'

function RailGroup({
  label,
  collapsed,
  children,
}: {
  label: string
  collapsed?: boolean
  children: React.ReactNode
}) {
  return (
    <nav className="flex flex-col gap-1 px-3" aria-label={label}>
      {!collapsed ? (
        <p className="px-2 font-mono text-[10px] font-medium tracking-[0.09em] text-faint uppercase">
          {label}
        </p>
      ) : null}
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
  collapsed,
  dotClassName,
  count,
  children,
}: {
  to: string
  params?: Record<string, string>
  search?: Record<string, string>
  icon?: LucideIcon
  active?: boolean
  collapsed?: boolean
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
        title={collapsed && typeof children === 'string' ? children : undefined}
        className={cn(
          'flex h-7 items-center gap-2 rounded-md text-[13px] text-muted-foreground outline-none transition-colors focus-visible:ring-2 focus-visible:ring-ring/60',
          collapsed ? 'justify-center px-0' : 'px-2',
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
        {!collapsed ? (
          <>
            <span className="min-w-0 flex-1 truncate">{children}</span>
            {count !== undefined ? (
              <span className="shrink-0 font-mono text-[11px] tabular-nums text-faint">
                {count}
              </span>
            ) : null}
          </>
        ) : null}
      </Link>
    </li>
  )
}

export function ProjectRail() {
  const { project } = useParams({ strict: false })

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

  const [identity, setIdentity] = useState<string | null>(null)
  useEffect(() => {
    setIdentity(getStoredIdentity())
  }, [])

  const [collapsed, setCollapsed] = useState(false)
  useEffect(() => {
    setCollapsed(getStoredSidebarCollapsed())
  }, [])

  function toggleCollapsed() {
    setCollapsed((prev) => {
      const next = !prev
      setStoredSidebarCollapsed(next)
      return next
    })
  }

  const assigneeOptions = useMemo(() => {
    const seen = new Set<string>()
    for (const b of beads) if (b.assignee) seen.add(b.assignee)
    return [...seen].sort()
  }, [beads])
  const mineCount = identity
    ? beads.filter((b) => b.assignee === identity).length
    : 0

  function chooseIdentity(value: string) {
    setStoredIdentity(value)
    setIdentity(value)
  }

  return (
    <aside
      className={cn(
        'flex shrink-0 flex-col overflow-hidden bg-sidebar transition-[width] duration-200 ease-out',
        collapsed ? 'w-12' : 'w-[232px]',
      )}
    >
      <div
        className={cn(
          'flex shrink-0 items-center gap-2',
          collapsed ? 'flex-col justify-center gap-1.5 py-2' : 'h-12 px-3',
        )}
      >
        <Link
          to="/"
          aria-label="bd board home"
          className="flex items-center gap-2 outline-none focus-visible:ring-2 focus-visible:ring-ring/60"
        >
          <AppIcon
            className={cn(
              'shrink-0 rounded-md',
              collapsed ? 'size-5' : 'size-6',
            )}
          />
          {!collapsed ? (
            <span className="text-sm font-semibold tracking-tight text-foreground">
              bd board
            </span>
          ) : null}
        </Link>
        <Button
          variant="ghost"
          size="icon-xs"
          onClick={toggleCollapsed}
          aria-label={collapsed ? 'Expand sidebar' : 'Collapse sidebar'}
          aria-expanded={!collapsed}
          title={collapsed ? 'Expand sidebar' : 'Collapse sidebar'}
          className={cn(
            'shrink-0 text-faint hover:text-foreground',
            !collapsed && 'ml-auto',
          )}
        >
          {collapsed ? (
            <ChevronsRight className="size-3.5" aria-hidden="true" />
          ) : (
            <ChevronsLeft className="size-3.5" aria-hidden="true" />
          )}
        </Button>
      </div>

      <nav aria-label="Home" className="flex flex-col gap-1 px-3 pt-2">
        <ul className="flex flex-col gap-0.5">
          <RailLink to="/" icon={Home} active={!project} collapsed={collapsed}>
            Home
          </RailLink>
        </ul>
      </nav>

      <div className="flex min-h-0 flex-1 flex-col gap-4 overflow-y-auto py-3">
        <RailGroup label="Projects" collapsed={collapsed}>
          {projects.map((p) => (
            <RailLink
              key={p.id}
              to="/p/$project"
              params={{ project: p.id }}
              icon={Folder}
              active={p.id === project}
              collapsed={collapsed}
              count={p.counts.total}
            >
              {p.name}
            </RailLink>
          ))}
        </RailGroup>

        {!collapsed && project ? (
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
            {identity ? (
              <li className="group/mine flex h-7 items-center gap-1 rounded-md pr-1 pl-2 text-[13px] text-muted-foreground hover:bg-foreground/6 hover:text-foreground">
                <Link
                  to="/p/$project"
                  params={{ project }}
                  search={{ assignee: identity }}
                  className="flex min-w-0 flex-1 items-center gap-2 outline-none focus-visible:ring-2 focus-visible:ring-ring/60"
                >
                  <span
                    className="size-1.5 shrink-0 rounded-full bg-primary-text"
                    aria-hidden="true"
                  />
                  <span className="min-w-0 flex-1 truncate">
                    Assigned to me
                  </span>
                  <span className="shrink-0 font-mono text-[11px] tabular-nums text-faint">
                    {mineCount}
                  </span>
                </Link>
                <Button
                  variant="ghost"
                  size="icon-xs"
                  onClick={() => chooseIdentity('')}
                  aria-label="Forget who I am"
                  title={`Signed in as ${identity}`}
                  className="size-5 shrink-0 text-faint opacity-0 hover:bg-transparent hover:text-foreground focus-visible:opacity-100 group-hover/mine:opacity-100"
                >
                  <X className="size-3" aria-hidden="true" />
                </Button>
              </li>
            ) : assigneeOptions.length > 0 ? (
              <li className="px-2">
                <select
                  defaultValue=""
                  onChange={(event) => chooseIdentity(event.target.value)}
                  aria-label="Which assignee is me?"
                  className="h-7 w-full appearance-none rounded-md bg-transparent px-2 text-[13px] text-muted-foreground outline-none hover:bg-foreground/6 hover:text-foreground focus-visible:ring-2 focus-visible:ring-ring/60"
                >
                  <option value="" disabled>
                    Assigned to me…
                  </option>
                  {assigneeOptions.map((a) => (
                    <option key={a} value={a}>
                      {a}
                    </option>
                  ))}
                </select>
              </li>
            ) : null}
          </RailGroup>
        ) : null}
      </div>
    </aside>
  )
}
