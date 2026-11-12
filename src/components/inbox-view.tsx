import { Link } from '@tanstack/react-router'
import {
  ArrowRightLeft,
  Ban,
  Bookmark,
  Bot,
  CircleCheck,
  Copy,
  Hand,
  Link2,
  ListTree,
  Minus,
  MessageSquare,
} from 'lucide-react'
import type { LucideIcon } from 'lucide-react'
import { useEffect, useMemo, useState } from 'react'
import { toast } from 'sonner'

import { LIST_ROW } from '@/components/home-sections'
import { ProjectChip } from '@/components/project-chip'
import { Button } from '@/components/ui/button'
import { Card } from '@/components/ui/card'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'
import { useInbox } from '@/hooks/use-inbox'
import type { InboxEntry, ProjectInboxState } from '@/hooks/use-inbox'
import { formatClock, formatDay, groupByDay, isForMe } from '@/lib/events'
import { getStoredIdentity } from '@/lib/identity'
import { isAgentActor } from '@/lib/lease'
import { setConfigFn } from '@/lib/server'
import { initials, toErrorMessage } from '@/lib/utils'

import type { Bead, Project } from '@/lib/types'

type Scope = 'mine' | 'all' | 'agents'

const SCOPES: { key: Scope; label: string }[] = [
  { key: 'mine', label: 'For me' },
  { key: 'all', label: 'All activity' },
  { key: 'agents', label: 'Agents only' },
]

export function InboxView({
  projects,
  beadsByProject,
}: {
  projects: Project[]
  beadsByProject: Map<string, Bead[]>
}) {
  const { states, unread, markAllRead, cursors } = useInbox(projects)
  const [identity, setIdentity] = useState<string | null>(null)
  const [scope, setScope] = useState<Scope>('mine')
  const [projectFilter, setProjectFilter] = useState('all')
  const [enabling, setEnabling] = useState<string | null>(null)
  useEffect(() => {
    setIdentity(getStoredIdentity())
  }, [])

  const allBeads = useMemo(
    () => [...beadsByProject.values()].flat(),
    [beadsByProject],
  )

  const entries = useMemo(() => {
    const all: InboxEntry[] = []
    for (const state of states.values()) {
      if (state.data) all.push(...state.data.entries)
    }
    return all.sort((a, b) => Date.parse(b.ts) - Date.parse(a.ts))
  }, [states])

  // Agents among the actors in view: a leased heartbeat, never the app identity.
  const agentActors = useMemo(() => {
    const names = new Set<string>()
    for (const entry of entries) {
      const actor = entry.actor
      if (actor && isAgentActor(actor, allBeads, identity)) names.add(actor)
    }
    return names
  }, [entries, allBeads, identity])

  const visible = entries.filter((entry) => {
    if (projectFilter !== 'all' && entry.projectId !== projectFilter) {
      return false
    }
    if (scope === 'mine') return identity !== null && isForMe(entry, identity)
    if (scope === 'agents') return agentActors.has(entry.actor ?? '')
    return true
  })
  const groups = groupByDay(visible, new Date())
  const mineCount =
    identity === null ? 0 : entries.filter((e) => isForMe(e, identity)).length
  const indexById = new Map(projects.map((p, i) => [p.id, i]))
  const live = [...states.values()].some((s) => s.data && !s.data.disabled)
  const pruned = [...states.values()].some((s) => s.data?.pruned)
  const off = projects.filter((p) => states.get(p.id)?.disabled)

  async function enable(project: Project, state: ProjectInboxState) {
    setEnabling(project.id)
    try {
      await setConfigFn({
        data: { project: project.id, key: 'events-journal', value: 'true' },
      })
      state.refetch()
    } catch (err) {
      toast.error(toErrorMessage(err, 'Could not turn on live updates'))
    } finally {
      setEnabling(null)
    }
  }

  return (
    <div className="mx-auto flex max-w-[1160px] flex-col gap-section pb-page">
      <header className="flex items-start justify-between gap-4">
        <div className="flex flex-col gap-1">
          <h1 className="text-title font-semibold tracking-[-0.01em]">Inbox</h1>
          <p className="text-body text-muted-foreground">
            Activity on beads you own, are assigned to, or commented on · all
            projects
          </p>
        </div>
        {live ? (
          <span className="flex items-center gap-1.5 text-badge text-muted-foreground">
            <span
              className="size-1.5 rounded-full bg-success"
              aria-hidden="true"
            />
            Live
          </span>
        ) : null}
      </header>

      <div className="flex flex-wrap items-center gap-2">
        {SCOPES.map(({ key, label }) => (
          <Button
            key={key}
            size="sm"
            variant={scope === key ? 'secondary' : 'ghost'}
            aria-pressed={scope === key}
            onClick={() => setScope(key)}
          >
            {label}
            {key === 'mine' ? (
              <span className="font-mono text-xs">{mineCount}</span>
            ) : null}
          </Button>
        ))}
        <Select value={projectFilter} onValueChange={setProjectFilter}>
          <SelectTrigger size="sm" aria-label="Project">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">All projects</SelectItem>
            {projects.map((p) => (
              <SelectItem key={p.id} value={p.id}>
                {p.name}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
        <Button
          size="sm"
          variant="ghost"
          className="ml-auto"
          onClick={markAllRead}
          disabled={unread === 0}
        >
          Mark all read
        </Button>
      </div>

      {off.length > 0 ? (
        <Card className="flex flex-col gap-3 p-4">
          <p className="text-body">
            Live updates are off for{' '}
            {off.length === 1 ? 'this project' : 'these projects'}. Turn them on
            to see their activity here.
          </p>
          <ul className="flex flex-col gap-2">
            {off.map((project) => {
              const state = states.get(project.id)
              if (!state) return null
              return (
                <li
                  key={project.id}
                  className="flex items-center justify-between gap-4"
                >
                  <span className="text-body font-medium">{project.name}</span>
                  <Button
                    size="sm"
                    variant="outline"
                    disabled={enabling === project.id}
                    onClick={() => enable(project, state)}
                  >
                    Enable
                  </Button>
                </li>
              )
            })}
          </ul>
        </Card>
      ) : null}

      {projects.map((project) => {
        const state = states.get(project.id)
        if (!state?.error) return null
        return (
          <p key={project.id} className="text-body text-destructive">
            {project.name}:{' '}
            {toErrorMessage(state.error, 'Could not load activity')}
          </p>
        )
      })}

      {pruned ? (
        <p className="text-body text-muted-foreground">
          Older activity was pruned; showing what the journal still holds.
        </p>
      ) : null}

      {visible.length === 0 ? (
        <p className="text-body text-muted-foreground">
          {scope === 'mine' && identity === null
            ? "Pick yourself under Who are you? at the bottom of a project's sidebar to see your activity here."
            : 'No activity to show.'}
        </p>
      ) : (
        <>
          <InboxGroup
            title="Today"
            items={groups.today}
            cursors={cursors}
            identity={identity}
            indexById={indexById}
            agents={agentActors}
          />
          <InboxGroup
            title="Yesterday"
            items={groups.yesterday}
            cursors={cursors}
            identity={identity}
            indexById={indexById}
            agents={agentActors}
          />
          <InboxGroup
            title="Earlier"
            items={groups.earlier}
            cursors={cursors}
            identity={identity}
            indexById={indexById}
            agents={agentActors}
            showDay
          />
        </>
      )}
    </div>
  )
}

function InboxGroup({
  title,
  items,
  cursors,
  identity,
  indexById,
  agents,
  showDay = false,
}: {
  title: string
  items: InboxEntry[]
  cursors: Partial<Record<string, number>>
  identity: string | null
  indexById: Map<string, number>
  agents: Set<string>
  /** Earlier rows show the day rather than the clock. */
  showDay?: boolean
}) {
  if (items.length === 0) return null
  return (
    <section className="flex flex-col gap-2">
      <h2 className="text-body font-medium text-muted-foreground">
        {title} <span className="font-mono text-xs">{items.length}</span>
      </h2>
      <ul className="flex flex-col">
        {items.map((entry) => {
          const cursor = cursors[entry.projectId]
          const unread =
            identity !== null &&
            cursor !== undefined &&
            entry.seq > cursor &&
            isForMe(entry, identity)
          return (
            <InboxRow
              key={`${entry.projectId}:${entry.seq}`}
              entry={entry}
              unread={unread}
              index={indexById.get(entry.projectId) ?? 0}
              agent={agents.has(entry.actor ?? '')}
              showDay={showDay}
            />
          )
        })}
      </ul>
    </section>
  )
}

/** The icon names what kind of change the entry is, so the verb is not the only cue. */
function entryIcon(entry: InboxEntry): LucideIcon {
  if (entry.verb === 'claimed') return Hand
  switch (entry.op) {
    case 'update':
      return ArrowRightLeft
    case 'close':
      return CircleCheck
    case 'comment':
      return MessageSquare
    case 'dep_add':
    case 'dep_remove':
      return depIcon(entry.depKind)
    case 'create':
      return Bookmark
    default:
      return Minus
  }
}

/** Blocks get the ban sign; other links get a kind-specific mark. */
function depIcon(kind: string | undefined): LucideIcon {
  switch (kind) {
    case 'blocks':
      return Ban
    case 'duplicates':
      return Copy
    case 'parent-child':
      return ListTree
    default:
      return Link2
  }
}

function InboxRow({
  entry,
  unread,
  index,
  agent,
  showDay,
}: {
  entry: InboxEntry
  unread: boolean
  index: number
  agent: boolean
  showDay: boolean
}) {
  const actor = entry.actor ?? ''
  const Icon = entryIcon(entry)
  return (
    <li className="border-b border-border/60 last:border-0">
      <Link
        to="/p/$project"
        params={{ project: entry.projectId }}
        search={{ bead: entry.issueId }}
        className={LIST_ROW}
      >
        <span
          className={`mt-1.5 size-1.5 shrink-0 rounded-full ${unread ? 'bg-primary' : ''}`}
          aria-label={unread ? 'Unread' : undefined}
          role={unread ? 'img' : undefined}
        />
        {agent ? (
          <span
            aria-hidden="true"
            className="flex size-6 shrink-0 items-center justify-center rounded-sm bg-project-1"
          >
            <Bot className="size-3.5" />
          </span>
        ) : (
          <span
            aria-hidden="true"
            className="flex size-6 shrink-0 items-center justify-center rounded-full bg-muted text-badge font-medium"
          >
            {initials(actor)}
          </span>
        )}
        <span className="flex min-w-0 flex-1 flex-col gap-0.5">
          <span className="flex min-w-0 flex-wrap items-center gap-x-2 gap-y-0.5 text-body">
            <span className="font-medium text-foreground">{actor}</span>
            <span className="text-muted-foreground">{entry.verb}</span>
            <span className="font-mono text-xs text-muted-foreground">
              {entry.issueId}
            </span>
            <span className="min-w-0 truncate text-foreground">
              {entry.title}
            </span>
          </span>
          <span className="flex min-w-0 flex-wrap items-center gap-x-1.5 text-body text-muted-foreground">
            <Icon className="size-3.5 shrink-0" aria-hidden="true" />
            {entry.detail ? <span>{entry.detail}</span> : null}
            {entry.quote ? (
              <span className="text-foreground">“{entry.quote}”</span>
            ) : null}
          </span>
        </span>
        <span className="flex shrink-0 flex-col items-end gap-1 text-xs text-muted-foreground">
          <time dateTime={entry.ts}>
            {showDay ? formatDay(entry.ts) : formatClock(entry.ts)}
          </time>
          <ProjectChip name={entry.projectName} index={index} />
        </span>
      </Link>
    </li>
  )
}
