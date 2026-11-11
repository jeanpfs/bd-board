import { useMemo } from 'react'
import { Link } from '@tanstack/react-router'
import { useQuery } from '@tanstack/react-query'
import { Columns3, Layers, Plus } from 'lucide-react'

import {
  AttentionBlock,
  AttentionRow,
  LIST_ROW,
  Section,
} from '@/components/home-sections'
import { PriorityBadge } from '@/components/priority-badge'
import { SubtaskProgress } from '@/components/subtask-progress'
import { Avatar, AvatarFallback } from '@/components/ui/avatar'
import { Button } from '@/components/ui/button'
import { InteractiveRow } from '@/components/ui/interactive-row'
import { attentionList, closedThisWeek } from '@/lib/attention'
import {
  KNOWLEDGE_TYPE_LABEL,
  KNOWLEDGE_TYPE_TEXT_CLASS,
} from '@/lib/knowledge'
import { getProjectKnowledgeFn } from '@/lib/server'
import { compareBeads, isReady } from '@/lib/sort'
import { relativeDate } from '@/lib/time'
import { isEpic, mapStatus } from '@/lib/types'
import { cn, initials } from '@/lib/utils'

import type { Bead } from '@/lib/types'

const READY_PREVIEW = 3
const DECISION_TYPES = new Set(['decision', 'learned'])

/** Numbers inside running text stay readable without shouting. */
function Num({ children }: { children: React.ReactNode }) {
  return (
    <span className="font-medium text-foreground tabular-nums">{children}</span>
  )
}

export function ProjectOverview({
  project,
  name,
  beads,
  liveIndicator,
  onOpen,
  onOpenKnowledge,
  onCreate,
}: {
  project: string
  name: string
  beads: Bead[]
  liveIndicator: React.ReactNode
  onOpen: (bead: Bead) => void
  onOpenKnowledge: (id: string) => void
  onCreate: () => void
}) {
  // Recomputed when the bead list refreshes, not on every render.
  const now = useMemo(() => Date.now(), [beads])

  const summary = useMemo(() => {
    let open = 0
    let inProgress = 0
    for (const b of beads) {
      const column = mapStatus(b).column
      if (column === 'open' || column === 'blocked') open += 1
      else if (column === 'in_progress') inProgress += 1
    }
    return { open, inProgress, closed: closedThisWeek(beads, now) }
  }, [beads, now])

  const attention = useMemo(() => attentionList(beads, now), [beads, now])

  const epics = useMemo(
    () =>
      beads
        .filter((b) => isEpic(b) && mapStatus(b).column !== 'closed')
        .map((epic) => ({
          epic,
          children: beads.filter((b) => b.parent === epic.id),
        }))
        .filter((e) => e.children.length > 0),
    [beads],
  )

  const ready = useMemo(
    () => beads.filter(isReady).sort(compareBeads('priority')),
    [beads],
  )
  const inProgress = useMemo(
    () =>
      beads
        .filter((b) => mapStatus(b).column === 'in_progress')
        .sort(compareBeads('priority')),
    [beads],
  )

  const knowledgeQuery = useQuery({
    queryKey: ['project-knowledge', project],
    queryFn: () => getProjectKnowledgeFn({ data: { project } }),
    staleTime: 30_000,
  })
  const decisions = useMemo(
    () =>
      (knowledgeQuery.data?.knowledge ?? [])
        .filter((k) => DECISION_TYPES.has(k.type))
        .sort((a, b) => (b.created_at ?? '').localeCompare(a.created_at ?? ''))
        .slice(0, 2),
    [knowledgeQuery.data],
  )

  return (
    <div className="min-h-0 flex-1 overflow-y-auto">
      <div className="mx-auto flex w-full max-w-[1160px] flex-col gap-section pb-page">
        <header className="flex flex-wrap items-start justify-between gap-4">
          <div className="flex min-w-0 flex-col gap-1">
            <div className="flex items-center gap-3">
              <h1 className="truncate text-title font-semibold tracking-[-0.01em]">
                {name}
              </h1>
              {liveIndicator}
            </div>
            <p className="text-body text-muted-foreground">
              <Num>{summary.open}</Num> open · <Num>{summary.inProgress}</Num>{' '}
              in progress · <Num>{summary.closed}</Num> closed this week
            </p>
          </div>
          <div className="flex items-center gap-2">
            <Button variant="ghost" size="sm" asChild>
              <Link
                to="/p/$project"
                params={{ project }}
                search={{ tab: 'board' }}
              >
                <Columns3 aria-hidden="true" />
                Open board
              </Link>
            </Button>
            <Button size="sm" onClick={onCreate}>
              <Plus aria-hidden="true" />
              New bead
            </Button>
          </div>
        </header>

        <AttentionBlock
          title="Needs attention"
          meta={attention.length}
          empty="Nothing needs attention: no open P0, nothing overdue, nothing blocked, nothing stale."
        >
          {attention.map(({ kind, bead, detail }) => (
            <AttentionRow
              key={bead.id}
              kind={kind}
              id={bead.id}
              title={bead.title}
              meta={bead.assignee ? `${detail} · ${bead.assignee}` : detail}
              action={
                <Button
                  size="sm"
                  variant="outline"
                  onClick={() => onOpen(bead)}
                >
                  Open
                </Button>
              }
            />
          ))}
        </AttentionBlock>

        <div className="grid gap-x-12 gap-y-section lg:grid-cols-2">
          <div className="flex min-w-0 flex-col gap-section">
            {epics.length > 0 ? (
              <Section title="Epics">
                <ul className="flex flex-col">
                  {epics.map(({ epic, children }) => {
                    const done = children.filter(
                      (c) => mapStatus(c).column === 'closed',
                    ).length
                    return (
                      <li
                        key={epic.id}
                        className="border-b border-border/60 last:border-0"
                      >
                        <InteractiveRow
                          variant="plain"
                          size="flush"
                          onClick={() => onOpen(epic)}
                          className={cn(LIST_ROW, 'py-2.5')}
                        >
                          <Layers
                            className="size-3.5 shrink-0 text-primary-text"
                            aria-label="Epic"
                          />
                          <span className="flex min-w-0 flex-1 flex-col gap-1.5">
                            <span className="flex min-w-0 items-baseline gap-2">
                              <span className="shrink-0 font-mono text-xs text-muted-foreground">
                                {epic.id}
                              </span>
                              <span className="truncate text-foreground">
                                {epic.title}
                              </span>
                            </span>
                            <span className="flex items-center gap-3">
                              <SubtaskProgress
                                childBeads={children}
                                showDots={false}
                                className="max-w-[260px] flex-1"
                              />
                              <span className="shrink-0 text-xs text-muted-foreground tabular-nums">
                                {done}/{children.length} subtasks done
                              </span>
                            </span>
                          </span>
                        </InteractiveRow>
                      </li>
                    )
                  })}
                </ul>
              </Section>
            ) : null}

            <Section
              title="Ready to pick up"
              meta={
                ready.length > 0
                  ? `${ready.length}, nobody blocking them`
                  : undefined
              }
            >
              {ready.length === 0 ? (
                <p className="px-3 text-body text-muted-foreground">
                  Nothing is ready: every open bead waits on another.
                </p>
              ) : (
                <ul className="flex flex-col">
                  {ready.slice(0, READY_PREVIEW).map((bead) => (
                    <li
                      key={bead.id}
                      className="border-b border-border/60 last:border-0"
                    >
                      <InteractiveRow
                        variant="plain"
                        size="flush"
                        onClick={() => onOpen(bead)}
                        className={LIST_ROW}
                      >
                        <PriorityBadge priority={bead.priority} />
                        <span className="shrink-0 font-mono text-xs text-muted-foreground">
                          {bead.id}
                        </span>
                        <span className="truncate text-foreground">
                          {bead.title}
                        </span>
                      </InteractiveRow>
                    </li>
                  ))}
                </ul>
              )}
              {ready.length > READY_PREVIEW ? (
                <Link
                  to="/p/$project"
                  params={{ project }}
                  search={{ tab: 'board', ready: '1' }}
                  className="self-start rounded px-3 text-body text-primary-text outline-none hover:underline focus-visible:ring-2 focus-visible:ring-ring/60"
                >
                  Show all {ready.length}
                </Link>
              ) : null}
            </Section>
          </div>

          <div className="flex min-w-0 flex-col gap-section">
            <Section title="In progress" meta={inProgress.length}>
              {inProgress.length === 0 ? (
                <p className="px-3 text-body text-muted-foreground">
                  Nobody is working on anything right now.
                </p>
              ) : (
                <ul className="flex flex-col">
                  {inProgress.map((bead) => (
                    <li
                      key={bead.id}
                      className="border-b border-border/60 last:border-0"
                    >
                      <InteractiveRow
                        variant="plain"
                        size="flush"
                        onClick={() => onOpen(bead)}
                        className={LIST_ROW}
                      >
                        <PriorityBadge priority={bead.priority} />
                        <span className="shrink-0 font-mono text-xs text-muted-foreground">
                          {bead.id}
                        </span>
                        <span className="min-w-0 flex-1 truncate text-foreground">
                          {bead.title}
                        </span>
                        {bead.assignee ? (
                          <span className="flex shrink-0 items-center gap-1.5 text-xs text-muted-foreground">
                            <Avatar
                              size="sm"
                              className="size-[22px] bg-white/9 ring-1 ring-inset ring-border-strong"
                            >
                              <AvatarFallback className="bg-transparent text-badge font-semibold text-foreground">
                                {initials(bead.assignee)}
                              </AvatarFallback>
                            </Avatar>
                            {bead.assignee}
                          </span>
                        ) : (
                          <span className="shrink-0 text-xs text-faint">
                            unassigned
                          </span>
                        )}
                      </InteractiveRow>
                    </li>
                  ))}
                </ul>
              )}
            </Section>

            {decisions.length > 0 ? (
              <Section title="Latest decisions" meta="from Knowledge">
                <ul className="flex flex-col">
                  {decisions.map((entry) => (
                    <li
                      key={entry.id}
                      className="border-b border-border/60 last:border-0"
                    >
                      <InteractiveRow
                        variant="plain"
                        size="flush"
                        onClick={() => onOpenKnowledge(entry.id)}
                        className="flex w-full flex-col gap-1 rounded-md px-3 py-3 text-left outline-none hover:bg-foreground/4 focus-visible:ring-2 focus-visible:ring-ring/60"
                      >
                        <span className="flex min-w-0 items-baseline gap-2 text-xs text-muted-foreground">
                          <span
                            className={cn(
                              'font-medium',
                              KNOWLEDGE_TYPE_TEXT_CLASS[entry.type],
                            )}
                          >
                            {KNOWLEDGE_TYPE_LABEL[entry.type]}
                          </span>
                          on
                          <span className="font-mono">{entry.bead_id}</span>
                          <span className="truncate">{entry.bead_title}</span>
                          <span className="ml-auto shrink-0 text-faint">
                            {relativeDate(entry.created_at)}
                          </span>
                        </span>
                        <span className="line-clamp-2 text-body text-foreground">
                          {entry.content}
                        </span>
                      </InteractiveRow>
                    </li>
                  ))}
                </ul>
              </Section>
            ) : null}
          </div>
        </div>
      </div>
    </div>
  )
}
