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
    enabled: Boolean(project),
  })
  const projectName =
    projectsQuery.data?.find((p) => p.id === project)?.name ?? project

  if (!project) {
    return null
  }

  return (
    <header className="flex h-12 shrink-0 items-center gap-3 border-b border-border bg-background px-4">
      <span className="min-w-0 truncate text-sm font-semibold text-foreground capitalize">
        {projectName}
      </span>

      <div className="h-5 w-px shrink-0 bg-border" aria-hidden="true" />

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
                'relative inline-flex h-12 items-center gap-1.5 px-2.5 text-[13px] font-medium outline-none transition-colors',
                'after:pointer-events-none after:absolute after:inset-x-1 after:bottom-0 after:h-0.5 after:rounded-full after:bg-transparent',
                'focus-visible:ring-2 focus-visible:ring-ring/60 focus-visible:ring-inset',
                active
                  ? 'text-foreground after:bg-[var(--primary-text)]'
                  : 'text-muted-foreground hover:bg-muted/40 hover:text-foreground',
              )}
            >
              <Icon className="size-3.5" aria-hidden="true" />
              {item.label}
            </Link>
          )
        })}
      </div>
    </header>
  )
}
