import { Link } from '@tanstack/react-router'
import { Bot } from 'lucide-react'
import { useEffect, useMemo, useState } from 'react'
import { toast } from 'sonner'

import { LIST_ROW } from '@/components/home-sections'
import { ProjectChip } from '@/components/project-chip'
import { Badge } from '@/components/ui/badge'
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
import { groupByDay, isForMe, JOURNAL_DISABLED_TEXT } from '@/lib/events'
import { getStoredIdentity } from '@/lib/identity'
import { enableEventsJournalFn } from '@/lib/server'

import type { Bead, Project } from '@/lib/types'

type Scope = 'mine' | 'all' | 'agents'

const SCOPES: { key: Scope; label: string }[] = [
  { key: 'mine', label: 'For me' },
  { key: 'all', label: 'All activity' },
  { key: 'agents', label: 'Agents only' },
]

const TIME_FORMAT: Intl.DateTimeFormatOptions = {
  hour: 'numeric',
  minute: '2-digit',
}

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

  // An actor is an agent when it holds (or held) a lease on a bead it's assigned.
  const agents = useMemo(() => {
    const names = new Set<string>()
    for (const beads of beadsByProject.values()) {
      for (const bead of beads) {
        if (bead.assignee && (bead.lease_expires_at || bead.heartbeat_at)) {
          names.add(bead.assignee)
        }
      }
    }
    return names
  }, [beadsByProject])

  const entries = useMemo(() => {
    const all: InboxEntry[] = []
    for (const state of states.values()) {
      if (state.data) all.push(...state.data.entries)
    }
    return all.sort((a, b) => Date.parse(b.ts) - Date.parse(a.ts))
  }, [states])

  const visible = entries.filter((entry) => {
    if (projectFilter !== 'all' && entry.projectId !== projectFilter) {
      return false
    }
    if (scope === 'mine') return identity !== null && isForMe(entry, identity)
    if (scope === 'agents') return agents.has(entry.actor ?? '')
    return true
  })
  const groups = groupByDay(visible, new Date())
  const mineCount =
    identity === null ? 0 : entries.filter((e) => isForMe(e, identity)).length
  const indexById = new Map(projects.map((p, i) => [p.id, i]))
  const live = [...states.values()].some((s) => s.data)
  const pruned = [...states.values()].some((s) => s.data?.pruned)

  async function enable(project: Project, state: ProjectInboxState) {
    setEnabling(project.id)
    try {
      await enableEventsJournalFn({ data: { project: project.id } })
      state.refetch()
    } catch (err) {
      toast.error(err instanceof Error ? err.message : String(err))
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

      {projects.map((project) => {
        const state = states.get(project.id)
        if (!state?.error) return null
        const journalOff = state.error.message.includes(JOURNAL_DISABLED_TEXT)
        return journalOff ? (
          <Card
            key={project.id}
            className="flex flex-row items-center justify-between gap-4 p-4"
          >
            <p className="text-body">
              Live updates are off for {project.name}. Turn them on to see its
              activity here.
            </p>
            <Button
              size="sm"
              disabled={enabling === project.id}
              onClick={() => enable(project, state)}
            >
              Enable live updates
            </Button>
          </Card>
        ) : (
          <p key={project.id} className="text-body text-destructive">
            {project.name}: {state.error.message}
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
            ? "Pick yourself under Assigned to me in a project's sidebar to see your activity here."
            : 'No activity to show.'}
        </p>
      ) : (
        <>
          <InboxGroup
            title="Today"
            items={groups.today}
            cursors={cursors}
            indexById={indexById}
            agents={agents}
          />
          <InboxGroup
            title="Yesterday"
            items={groups.yesterday}
            cursors={cursors}
            indexById={indexById}
            agents={agents}
          />
          <InboxGroup
            title="Earlier"
            items={groups.earlier}
            cursors={cursors}
            indexById={indexById}
            agents={agents}
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
  indexById,
  agents,
}: {
  title: string
  items: InboxEntry[]
  cursors: Record<string, number>
  indexById: Map<string, number>
  agents: Set<string>
}) {
  if (items.length === 0) return null
  return (
    <section className="flex flex-col gap-2">
      <h2 className="text-body font-medium text-muted-foreground">
        {title} <span className="font-mono text-xs">{items.length}</span>
      </h2>
      <ul className="flex flex-col">
        {items.map((entry) => (
          <InboxRow
            key={`${entry.projectId}:${entry.seq}`}
            entry={entry}
            unread={entry.seq > (cursors[entry.projectId] ?? 0)}
            index={indexById.get(entry.projectId) ?? 0}
            agent={agents.has(entry.actor ?? '')}
          />
        ))}
      </ul>
    </section>
  )
}

function InboxRow({
  entry,
  unread,
  index,
  agent,
}: {
  entry: InboxEntry
  unread: boolean
  index: number
  agent: boolean
}) {
  const actor = entry.actor ?? ''
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
        <span className="flex min-w-0 flex-1 flex-col gap-0.5">
          <span className="flex min-w-0 flex-wrap items-center gap-x-2 gap-y-0.5 text-body">
            <span className="font-medium text-foreground">{actor}</span>
            {agent ? (
              <Badge className="gap-1">
                <Bot className="size-3" aria-hidden="true" />
                Bot
              </Badge>
            ) : null}
            <span className="text-muted-foreground">{entry.verb}</span>
            <span className="font-mono text-xs text-muted-foreground">
              {entry.issueId}
            </span>
            <span className="min-w-0 truncate text-foreground">
              {entry.title}
            </span>
          </span>
          {entry.detail || entry.quote ? (
            <span className="text-body text-muted-foreground">
              {entry.detail}
              {entry.quote ? (
                <span className="text-foreground"> “{entry.quote}”</span>
              ) : null}
            </span>
          ) : null}
        </span>
        <span className="flex shrink-0 flex-col items-end gap-1 text-xs text-muted-foreground">
          <time dateTime={entry.ts}>
            {new Date(entry.ts).toLocaleTimeString([], TIME_FORMAT)}
          </time>
          <ProjectChip name={entry.projectName} index={index} />
        </span>
      </Link>
    </li>
  )
}
