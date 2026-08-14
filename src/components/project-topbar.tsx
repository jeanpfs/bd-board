import { Link, useParams, useSearch } from '@tanstack/react-router'
import { useQuery } from '@tanstack/react-query'
import { BookOpen, Columns3, ListTree } from 'lucide-react'

import { cn } from '@/lib/utils'
import { getProjects } from '@/lib/server'

import type { LucideIcon } from 'lucide-react'
import type { ProjectTab } from '@/components/board-header'

const TABS: { key: ProjectTab; label: string; icon: LucideIcon }[] = [
  { key: 'board', label: 'Board', icon: Columns3 },
  { key: 'hierarchy', label: 'Hierarchy', icon: ListTree },
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
    </header>
  )
}
