import { useEffect, useMemo, useState } from 'react'
import {
  Link,
  useLocation,
  useNavigate,
  useParams,
  useSearch,
} from '@tanstack/react-router'
import { useQuery, useQueryClient } from '@tanstack/react-query'
import {
  Bot,
  BookOpen,
  ChevronsLeft,
  ChevronsRight,
  Columns3,
  Gauge,
  Home,
  Settings,
  Inbox,
  ListTree,
  ListChecks,
  X,
  Plus,
} from 'lucide-react'

import { Avatar, AvatarFallback } from '@/components/ui/avatar'
import { isReady } from '@/lib/sort'
import { Button } from '@/components/ui/button'
import { EditProjectModal } from '@/components/edit-project-modal'
import { ConfirmDeleteModal } from '@/components/confirm-delete-modal'
import { ProjectActionsMenu } from '@/components/project-actions-menu'
import { ProjectChip } from '@/components/project-chip'
import { ProjectSwitcher } from '@/components/project-switcher'
import { projectProblem } from '@/lib/attention'
import { useInbox } from '@/hooks/use-inbox'
import { cn, initials } from '@/lib/utils'
import { getBeads, getProjects } from '@/lib/server'
import { PROJECTS_REFETCH_MS } from '@/lib/polling'

import { getStoredIdentity, setStoredIdentity } from '@/lib/identity'
import {
  getStoredSidebarCollapsed,
  setStoredSidebarCollapsed,
} from '@/lib/sidebar-collapse'
import { ViewEditor, useSavedViews } from '@/components/view-editor'
import { mapStatus } from '@/lib/types'

import type { LucideIcon } from 'lucide-react'
import type { ProjectTab } from '@/components/board-header'
import type { Project } from '@/lib/types'

const PROJECT_NAV: { key: ProjectTab; label: string; icon: LucideIcon }[] = [
  { key: 'overview', label: 'Overview', icon: Gauge },
  { key: 'board', label: 'Board', icon: Columns3 },
  { key: 'hierarchy', label: 'Hierarchy', icon: ListTree },
  { key: 'knowledge', label: 'Knowledge', icon: BookOpen },
  { key: 'agents', label: 'Agents', icon: Bot },
]

/** Why a project's row carries a dot, or null. Text goes to screen readers. */
function projectSignal(
  p: Project,
): { label: string; dotClassName: string } | null {
  const problem = projectProblem(p)
  if (problem) return { label: problem.label, dotClassName: 'bg-warn' }
  if (p.counts.blocked > 0) {
    return {
      label: `${p.counts.blocked} blocked`,
      dotClassName: 'bg-status-blocked',
    }
  }
  return null
}

function RailGroup({
  label,
  collapsed,
  action,
  children,
}: {
  label: string
  collapsed?: boolean
  action?: React.ReactNode
  children: React.ReactNode
}) {
  return (
    <nav className="flex flex-col gap-1 px-3" aria-label={label}>
      {!collapsed ? (
        <div className="flex items-center justify-between pb-0.5 pl-2">
          <p className="text-xs font-medium text-muted-foreground">{label}</p>
          {action}
        </div>
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
  leading,
  active,
  collapsed,
  dotClassName,
  count,
  signal,
  onMouseEnter,
  actions,
  children,
}: {
  to: string
  params?: Record<string, string>
  search?: Record<string, string>
  icon?: LucideIcon
  /** Replaces the icon, e.g. a project chip. */
  leading?: React.ReactNode
  active?: boolean
  collapsed?: boolean
  dotClassName?: string
  count?: number
  /** Trailing status dot; `label` is announced and shown as a tooltip. */
  signal?: { label: string; dotClassName: string } | null
  onMouseEnter?: () => void
  /** Edit/Delete handlers; renders the project actions menu beside the link. */
  actions?: { name: string; onEdit: () => void; onDelete: () => void }
  children: React.ReactNode
}) {
  return (
    <li
      onMouseEnter={onMouseEnter}
      className={cn(
        'group/row relative flex h-7 items-center rounded-md text-body text-muted-foreground transition-colors',
        active
          ? 'bg-foreground/8 text-foreground ring-1 ring-inset ring-border'
          : 'hover:bg-foreground/6 hover:text-foreground',
      )}
    >
      <Link
        to={to}
        params={params}
        search={search}
        aria-current={active ? 'page' : undefined}
        title={collapsed && typeof children === 'string' ? children : undefined}
        className={cn(
          'flex h-full min-w-0 flex-1 items-center gap-2 rounded-md outline-none focus-visible:ring-2 focus-visible:ring-ring/60',
          collapsed ? 'justify-center px-0' : 'px-2',
        )}
      >
        {leading ? (
          leading
        ) : Icon ? (
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
              <span className="shrink-0 font-mono text-badge tabular-nums text-faint">
                {count}
              </span>
            ) : null}
            {signal ? (
              <span
                title={signal.label}
                className={cn(
                  'flex size-4 shrink-0 items-center justify-center',
                  // The actions trigger sits over the signal; hide it
                  // whenever the trigger is visible.
                  actions &&
                    'group-hover/row:invisible group-has-[button:focus-visible]/row:invisible group-has-[[data-state=open]]/row:invisible',
                )}
              >
                <span
                  className={cn('size-1.5 rounded-full', signal.dotClassName)}
                  aria-hidden="true"
                />
                <span className="sr-only">{signal.label}</span>
              </span>
            ) : null}
          </>
        ) : null}
      </Link>
      {!collapsed && actions ? (
        <ProjectActionsMenu
          projectName={actions.name}
          side="right"
          onEdit={actions.onEdit}
          onDelete={actions.onDelete}
          className="absolute top-1/2 right-1 size-5 -translate-y-1/2 text-faint opacity-0 hover:bg-transparent focus-visible:opacity-100 group-hover/row:opacity-100"
          iconClassName="size-3"
        />
      ) : null}
    </li>
  )
}

export function ProjectRail() {
  const { project } = useParams({ strict: false })
  const searchParams = useSearch({ strict: false })
  const tab = searchParams.tab ?? 'overview'
  const queryClient = useQueryClient()
  const [editingProject, setEditingProject] = useState<
    (typeof projects)[0] | null
  >(null)
  const [deletingProjectId, setDeletingProjectId] = useState<string | null>(
    null,
  )

  const projectsQuery = useQuery({
    queryKey: ['projects'],
    queryFn: () => getProjects(),
    refetchInterval: PROJECTS_REFETCH_MS,
    staleTime: 5000,
  })
  const projects = projectsQuery.data ?? []
  // With no projects the start screen owns the window: no sidebar at all.
  const noProjects = projectsQuery.isSuccess && projects.length === 0
  const { unread: inboxUnread } = useInbox(projects)
  const pathname = useLocation({ select: (location) => location.pathname })

  const beadsQuery = useQuery({
    queryKey: ['beads', project],
    queryFn: () => getBeads({ data: { project: project! } }),
    enabled: Boolean(project),
    staleTime: 3000,
    // Shares the board's cache key; the board shows load errors immediately,
    // so a retrying fetch started here would hold it on the skeleton.
    retry: false,
  })
  const beads = project ? (beadsQuery.data ?? []) : []
  const readyCount = beads.filter(isReady).length
  const blockedCount = beads.filter(
    (b) => mapStatus(b).column === 'blocked',
  ).length
  const savedViews = useSavedViews(project ?? '')
  const navigate = useNavigate()
  const [creatingView, setCreatingView] = useState(false)

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

  if (noProjects) return null

  return (
    <>
      <aside
        className={cn(
          'flex shrink-0 flex-col overflow-hidden bg-sidebar transition-[width] duration-200 ease-out',
          collapsed ? 'w-12' : 'w-rail',
        )}
      >
        <div
          className={cn(
            'flex shrink-0 items-center',
            collapsed ? 'justify-center py-2' : 'h-14 px-2',
          )}
        >
          <ProjectSwitcher
            projects={projects}
            currentId={project}
            collapsed={collapsed}
          />
        </div>

        <nav aria-label="Home" className="flex flex-col gap-1 px-3 pt-1">
          <ul className="flex flex-col gap-0.5">
            <RailLink
              to="/"
              icon={Home}
              active={!project && pathname === '/'}
              collapsed={collapsed}
            >
              Home
            </RailLink>
            <RailLink
              to="/inbox"
              icon={Inbox}
              active={pathname === '/inbox'}
              collapsed={collapsed}
              count={inboxUnread}
            >
              Inbox
            </RailLink>
            <RailLink
              to="/my-work"
              icon={ListChecks}
              active={pathname === '/my-work'}
              collapsed={collapsed}
            >
              My work
            </RailLink>
          </ul>
        </nav>

        <div className="flex min-h-0 flex-1 flex-col gap-5 overflow-y-auto py-4">
          {project ? (
            <RailGroup label="Project" collapsed={collapsed}>
              {PROJECT_NAV.map((item) => (
                <RailLink
                  key={item.key}
                  to="/p/$project"
                  params={{ project }}
                  search={{ tab: item.key }}
                  icon={item.icon}
                  active={
                    !pathname.endsWith('/settings') &&
                    (tab === item.key ||
                      (item.key === 'overview' && tab === 'insights'))
                  }
                  collapsed={collapsed}
                >
                  {item.label}
                </RailLink>
              ))}
            </RailGroup>
          ) : (
            <RailGroup label="Projects" collapsed={collapsed}>
              {projects.map((p, i) => (
                <RailLink
                  key={p.id}
                  to="/p/$project"
                  params={{ project: p.id }}
                  leading={<ProjectChip name={p.name} index={i} />}
                  collapsed={collapsed}
                  signal={projectSignal(p)}
                  actions={{
                    name: p.name,
                    onEdit: () => setEditingProject(p),
                    onDelete: () => setDeletingProjectId(p.id),
                  }}
                  onMouseEnter={() =>
                    queryClient.prefetchQuery({
                      queryKey: ['beads', p.id],
                      queryFn: () => getBeads({ data: { project: p.id } }),
                      staleTime: 3000,
                    })
                  }
                >
                  {p.name}
                </RailLink>
              ))}
            </RailGroup>
          )}

          {!collapsed && project ? (
            <RailGroup
              label="Views"
              action={
                <Button
                  type="button"
                  variant="ghost"
                  size="icon-xs"
                  aria-label="New view"
                  className="text-muted-foreground"
                  onClick={() => setCreatingView(true)}
                >
                  <Plus aria-hidden="true" />
                </Button>
              }
            >
              <RailLink
                to="/p/$project"
                params={{ project }}
                search={{ tab: 'ready' }}
                active={tab === 'ready'}
                count={readyCount}
              >
                Ready
              </RailLink>
              <RailLink
                to="/p/$project"
                params={{ project }}
                search={{ tab: 'board', due: 'week' }}
                active={tab === 'board' && searchParams.due === 'week'}
              >
                Due this week
              </RailLink>
              {savedViews.views.map((view) => (
                <RailLink
                  key={view.id}
                  to="/p/$project"
                  params={{ project }}
                  search={{ tab: 'view', v: view.id }}
                  active={tab === 'view' && searchParams.v === view.id}
                >
                  {view.name}
                </RailLink>
              ))}
            </RailGroup>
          ) : null}
          {!collapsed && project ? (
            <RailGroup label="Quick filters">
              <RailLink
                to="/p/$project"
                params={{ project }}
                search={{ tab: 'board', view: 'status' }}
                dotClassName="bg-status-blocked"
                count={blockedCount}
              >
                Blocked
              </RailLink>
              {identity ? (
                <RailLink
                  to="/p/$project"
                  params={{ project }}
                  search={{ tab: 'board', assignee: identity }}
                  dotClassName="bg-primary-text"
                  count={mineCount}
                >
                  Assigned to me
                </RailLink>
              ) : assigneeOptions.length > 0 ? (
                <li className="px-2">
                  <select
                    defaultValue=""
                    onChange={(event) => chooseIdentity(event.target.value)}
                    aria-label="Which assignee is me?"
                    className="h-7 w-full appearance-none rounded-md bg-transparent px-2 text-body text-muted-foreground outline-none hover:bg-foreground/6 hover:text-foreground focus-visible:ring-2 focus-visible:ring-ring/60"
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
        {creatingView ? (
          <ViewEditor
            project={project ?? ''}
            onSaved={(view) =>
              void navigate({
                to: '/p/$project',
                params: { project: project ?? '' },
                search: { tab: 'view', v: view.id },
              })
            }
            onOpenChange={setCreatingView}
          />
        ) : null}

        <div
          className={cn(
            'flex shrink-0 items-center gap-2 border-t border-border',
            collapsed ? 'justify-center py-2' : 'h-12 px-3',
          )}
        >
          {!collapsed && identity ? (
            <div className="group/me flex min-w-0 flex-1 items-center gap-2">
              <Avatar size="sm" className="size-[22px] bg-white/9">
                <AvatarFallback className="bg-transparent text-badge font-semibold text-foreground">
                  {initials(identity)}
                </AvatarFallback>
              </Avatar>
              <span className="min-w-0 flex-1 truncate text-body text-muted-foreground">
                {identity}
              </span>
              <Button
                variant="ghost"
                size="icon-xs"
                onClick={() => chooseIdentity('')}
                aria-label="Forget who I am"
                title={`Signed in as ${identity}`}
                className="size-5 shrink-0 text-faint opacity-0 hover:bg-transparent hover:text-foreground focus-visible:opacity-100 group-hover/me:opacity-100"
              >
                <X className="size-3" aria-hidden="true" />
              </Button>
            </div>
          ) : null}
          {project ? (
            <Link
              to="/p/$project/settings"
              params={{ project }}
              search={{ section: 'general' }}
              aria-label="Project settings"
              title="Project settings"
              aria-current={pathname.endsWith('/settings') ? 'page' : undefined}
              className={cn(
                'flex size-6 shrink-0 items-center justify-center rounded-md text-faint outline-none hover:text-foreground focus-visible:ring-2 focus-visible:ring-ring/60',
                pathname.endsWith('/settings') && 'bg-white/9 text-foreground',
              )}
            >
              <Settings className="size-3.5" aria-hidden="true" />
            </Link>
          ) : null}
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
      </aside>
      {editingProject && (
        <EditProjectModal
          open={Boolean(editingProject)}
          onOpenChange={(open) => !open && setEditingProject(null)}
          project={editingProject}
        />
      )}
      {deletingProjectId && (
        <ConfirmDeleteModal
          open={Boolean(deletingProjectId)}
          onOpenChange={(open) => !open && setDeletingProjectId(null)}
          projectId={deletingProjectId}
          projectName={
            projects.find((p) => p.id === deletingProjectId)?.name ||
            deletingProjectId
          }
        />
      )}
    </>
  )
}
