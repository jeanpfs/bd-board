import { Link, useParams, useSearch } from '@tanstack/react-router'
import { useQuery } from '@tanstack/react-query'
import { BookOpen, Columns3, Zap } from 'lucide-react'

import { cn } from '@/lib/utils'
import { getProjects, getWriteConfigFn } from '@/lib/server'

import type { LucideIcon } from 'lucide-react'
import type { ProjectTab } from '@/components/board-header'

const TABS: { key: ProjectTab; label: string; icon: LucideIcon }[] = [
  { key: 'board', label: 'Board', icon: Columns3 },
  { key: 'knowledge', label: 'Knowledge', icon: BookOpen },
]

export function ProjectTopbar() {
  const { project } = useParams({ strict: false })
  const search = useSearch({ strict: false })
  const tab = search.tab ?? 'board'

  const projectsQuery = useQuery({
    queryKey: ['projects'],
    queryFn: () => getProjects(),
    refetchInterval: 15000,
    staleTime: 5000,
  })
  const projectName =
    projectsQuery.data?.find((p) => p.database === project)?.name ?? project

  const writeConfigQuery = useQuery({
    queryKey: ['write-config'],
    queryFn: () => getWriteConfigFn(),
    staleTime: Infinity,
  })
  const canWrite = writeConfigQuery.data?.writesEnabled === true

  return (
    <header className="flex h-12 shrink-0 items-center gap-4 border-b border-border bg-background px-4">
      <div className="flex min-w-0 items-center gap-1.5 text-sm">
        <Link
          to="/"
          className="text-muted-foreground outline-none transition-colors hover:text-foreground focus-visible:ring-2 focus-visible:ring-ring/60"
        >
          Projects
        </Link>
        {project ? (
          <>
            <span className="text-muted-foreground/40" aria-hidden="true">
              /
            </span>
            <span className="truncate font-medium text-foreground">
              {projectName}
            </span>
            <span className="font-mono text-[11.5px] text-faint">
              {project}
            </span>
          </>
        ) : null}
      </div>

      {project ? (
        <div
          className="flex items-center gap-1"
          role="tablist"
          aria-label="Project view"
        >
          {TABS.map((item) => {
            const Icon = item.icon
            const active = tab === item.key
            return (
              <Link
                key={item.key}
                to="/p/$project"
                params={{ project }}
                search={{ tab: item.key }}
                role="tab"
                aria-selected={active}
                className={cn(
                  'inline-flex h-7 items-center gap-1.5 rounded-md px-2.5 text-[13px] font-medium outline-none transition-colors focus-visible:ring-2 focus-visible:ring-ring/60',
                  active
                    ? 'text-foreground'
                    : 'text-muted-foreground hover:text-foreground',
                )}
                style={
                  active
                    ? {
                        boxShadow: 'inset 0 -2px 0 0 var(--primary-text)',
                      }
                    : undefined
                }
              >
                <Icon className="size-3.5" aria-hidden="true" />
                {item.label}
              </Link>
            )
          })}
        </div>
      ) : null}

      <div className="ml-auto flex items-center gap-2">
        <span
          className={cn(
            'inline-flex h-6 items-center gap-1.5 rounded-full px-2.5 text-[11px] font-medium',
            canWrite
              ? 'bg-status-closed/15 text-status-closed'
              : 'bg-foreground/6 text-muted-foreground',
          )}
          title={
            canWrite
              ? 'BD_BOARD_ALLOW_WRITE=true'
              : 'BD_BOARD_ALLOW_WRITE=false'
          }
        >
          {canWrite ? (
            <Zap className="size-3" aria-hidden="true" />
          ) : (
            <span className="size-1.5 rounded-full bg-current" />
          )}
          {canWrite ? 'Write mode' : 'Read-only'}
        </span>
      </div>
    </header>
  )
}
