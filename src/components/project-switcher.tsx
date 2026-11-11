import { Link } from '@tanstack/react-router'
import {
  Check,
  ChevronsUpDown,
  FolderOpen,
  LayoutGrid,
  Plus,
} from 'lucide-react'

import { AppIcon } from '@/components/app-icon'
import { ProjectChip } from '@/components/project-chip'
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu'
import { useProjectActions } from '@/hooks/use-project-actions'
import { projectProblem } from '@/lib/attention'
import { cn } from '@/lib/utils'

import type { Project } from '@/lib/types'

function projectSummary(p: Project): string {
  const problem = projectProblem(p)
  if (problem) return problem.label
  const open = p.counts.open + p.counts.deferred
  const parts = [
    open > 0 ? `${open} open` : null,
    p.counts.in_progress > 0 ? `${p.counts.in_progress} in progress` : null,
  ].filter(Boolean)
  return parts.length > 0 ? parts.join(' · ') : 'Nothing open'
}

/**
 * Top of the sidebar: shows where you are (a project or all projects) and
 * switches between them. Opening and initializing projects live here too.
 */
export function ProjectSwitcher({
  projects,
  currentId,
  collapsed,
}: {
  projects: Project[]
  currentId?: string
  collapsed: boolean
}) {
  const { handleOpenProject, handleInitProject } = useProjectActions()
  const index = projects.findIndex((p) => p.id === currentId)
  const current = index >= 0 ? projects[index] : undefined
  const name = current?.name ?? currentId ?? 'All projects'

  return (
    <DropdownMenu>
      <DropdownMenuTrigger
        aria-label={`Switch project (current: ${name})`}
        title={collapsed ? name : undefined}
        className={cn(
          'flex min-w-0 items-center gap-2 rounded-md text-left outline-none hover:bg-foreground/6 focus-visible:ring-2 focus-visible:ring-ring/60 data-[state=open]:bg-foreground/6',
          collapsed ? 'size-8 justify-center' : 'h-10 flex-1 px-2',
        )}
      >
        {current || currentId ? (
          <ProjectChip name={name} index={Math.max(index, 0)} size={22} />
        ) : (
          <AppIcon className="size-[22px] shrink-0 rounded-md" />
        )}
        {!collapsed ? (
          <>
            <span className="flex min-w-0 flex-1 flex-col">
              <span className="truncate text-body font-semibold text-foreground">
                {name}
              </span>
              <span
                className="truncate text-xs text-faint"
                title={current?.dir}
              >
                {current
                  ? current.dir
                  : `${projects.length} ${projects.length === 1 ? 'project' : 'projects'}`}
              </span>
            </span>
            <ChevronsUpDown
              className="size-3.5 shrink-0 text-faint"
              aria-hidden="true"
            />
          </>
        ) : null}
      </DropdownMenuTrigger>
      <DropdownMenuContent align="start" className="w-64">
        {projects.map((p, i) => (
          <DropdownMenuItem key={p.id} asChild>
            <Link
              to="/p/$project"
              params={{ project: p.id }}
              className="flex items-center gap-2.5"
            >
              <ProjectChip name={p.name} index={i} size={22} />
              <span className="flex min-w-0 flex-1 flex-col">
                <span className="truncate text-body text-foreground">
                  {p.name}
                </span>
                <span
                  className={cn(
                    'truncate text-xs',
                    projectProblem(p) ? 'text-warn' : 'text-faint',
                  )}
                >
                  {projectSummary(p)}
                </span>
              </span>
              {p.id === currentId ? (
                <Check className="size-3.5 shrink-0" aria-label="Current" />
              ) : null}
            </Link>
          </DropdownMenuItem>
        ))}
        {projects.length > 0 ? <DropdownMenuSeparator /> : null}
        <DropdownMenuItem onSelect={handleOpenProject}>
          <FolderOpen aria-hidden="true" />
          Open project…
        </DropdownMenuItem>
        <DropdownMenuItem onSelect={handleInitProject}>
          <Plus aria-hidden="true" />
          Init project…
        </DropdownMenuItem>
        <DropdownMenuItem asChild>
          <Link to="/">
            <LayoutGrid aria-hidden="true" />
            All projects
          </Link>
        </DropdownMenuItem>
      </DropdownMenuContent>
    </DropdownMenu>
  )
}
