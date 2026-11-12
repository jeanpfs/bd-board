import type { Bead } from './types.ts'
import { statusLabel } from './types.ts'

export type EventOp =
  | 'create'
  | 'update'
  | 'close'
  | 'delete'
  | 'dep_add'
  | 'dep_remove'
  | 'comment'

/** One record of `bd events tail --json`; `issue` is the full bead after the mutation. */
export interface BdEvent {
  seq: number
  ts: string
  op: EventOp
  issue_id: string
  /** Omitted for derived updates, such as an automatic unblock. */
  actor?: string
  issue?: Bead
  dep?: { kind: string; target: string; metadata?: string }
  comment?: {
    id?: string
    text: string
    author: string
    created_at?: string
    source?: string
  }
}

export interface TailEventsResult {
  events: BdEvent[]
  /** Set when the cursor fell behind the journal's oldest kept record. */
  truncated?: { floor: number; head: number }
}

/** One line of the inbox: a readable sentence about a bead, plus who it involves. */
export interface InboxItem {
  seq: number
  ts: string
  op: EventOp
  issueId: string
  title: string
  actor?: string
  verb: string
  detail?: string
  quote?: string
  /** Assignee and creator of the bead, used to decide whether it is for a person. */
  involves: string[]
}

/** Parses JSONL from `bd events tail`; blank lines are skipped and malformed lines throw. */
export function parseEventLines(text: string): TailEventsResult {
  const events: BdEvent[] = []
  let truncated: TailEventsResult['truncated']
  for (const raw of text.split('\n')) {
    const line = raw.trim()
    if (!line) continue
    const value = JSON.parse(line) as Record<string, unknown>
    if (value['code'] === 'events_journal_truncated') {
      truncated = { floor: Number(value['floor']), head: Number(value['head']) }
    } else {
      events.push(value as unknown as BdEvent)
    }
  }
  return truncated ? { events, truncated } : { events }
}

interface Described {
  verb: string
  detail?: string
}

function describeUpdate(
  event: BdEvent,
  prev: Bead | undefined,
): Described | undefined {
  // Derived updates carry no actor: bd made them, not a person, so they are not news.
  if (!event.actor) return undefined
  const issue = event.issue
  if (!issue) return { verb: 'updated' }

  const statusChanged = prev !== undefined && prev.status !== issue.status
  const claimed =
    !prev?.assignee &&
    issue.assignee !== undefined &&
    issue.assignee === event.actor
  if (claimed) {
    const parts = ['assigned']
    if (statusChanged) parts.push(`moved to ${statusLabel(issue.status)}`)
    return { verb: 'claimed', detail: parts.join(', ') }
  }
  if (prev && prev.status !== issue.status) {
    return {
      verb: 'updated',
      detail: `${statusLabel(prev.status)} → ${statusLabel(issue.status)}`,
    }
  }
  if (issue.due_at && issue.due_at !== prev?.due_at) {
    return { verb: 'updated', detail: `due ${issue.due_at.slice(0, 10)}` }
  }
  if (issue.assignee && issue.assignee !== prev?.assignee) {
    return { verb: 'updated', detail: `assigned to ${issue.assignee}` }
  }
  return { verb: 'updated' }
}

function describeDep(event: BdEvent, added: boolean): Described {
  const dep = event.dep
  const target = dep?.target ?? ''
  const kind = dep?.kind ?? ''
  if (added) {
    if (kind === 'blocks') {
      return { verb: 'added a blocker to', detail: `blocked by ${target}` }
    }
    if (kind === 'duplicates') {
      return { verb: 'marked', detail: `duplicate of ${target}` }
    }
    if (kind === 'parent-child') {
      return { verb: 'linked', detail: `child of ${target}` }
    }
    return { verb: 'linked', detail: `related to ${target}` }
  }
  if (kind === 'blocks') {
    return {
      verb: 'removed a blocker from',
      detail: `no longer blocked by ${target}`,
    }
  }
  return { verb: 'unlinked', detail: `${kind} ${target} removed` }
}

function describeOne(
  event: BdEvent,
  prev: Bead | undefined,
): Described | undefined {
  switch (event.op) {
    case 'create':
      return { verb: 'created' }
    case 'update':
      return describeUpdate(event, prev)
    case 'close':
      return { verb: 'closed', detail: event.issue?.close_reason }
    case 'delete':
      return { verb: 'deleted' }
    case 'dep_add':
      return describeDep(event, true)
    case 'dep_remove':
      return describeDep(event, false)
    case 'comment':
      return { verb: 'commented on' }
  }
}

/**
 * Turns journal records into inbox lines, in input order (oldest first).
 * `prevById` is the last known record per bead before the first event; the
 * walk advances its own copy so later events in the page diff against earlier ones.
 */
export function describeEvents(
  events: BdEvent[],
  prevById: Map<string, Bead>,
): InboxItem[] {
  const known = new Map(prevById)
  const items: InboxItem[] = []
  for (const event of events) {
    const prev = known.get(event.issue_id)
    const described = describeOne(event, prev)
    if (event.issue) known.set(event.issue_id, event.issue)
    if (!described) continue
    const issue = event.issue
    items.push({
      seq: event.seq,
      ts: event.ts,
      op: event.op,
      issueId: event.issue_id,
      title: issue?.title ?? event.issue_id,
      actor: event.actor ?? event.comment?.author,
      verb: described.verb,
      detail: described.detail,
      quote: event.comment?.text,
      involves: [issue?.assignee, issue?.created_by].filter(
        (name): name is string => name !== undefined,
      ),
    })
  }
  return items
}

/** An item is for me when someone else acted on a bead I am assigned to or created. */
export function isForMe(item: InboxItem, identity: string): boolean {
  return item.actor !== identity && item.involves.includes(identity)
}

/** Items newer than the read cursor (a journal seq). */
export function unreadCount(items: InboxItem[], cursor: number): number {
  return items.filter((item) => item.seq > cursor).length
}

/** stderr text bd prints when the events journal is off for a project. */
export const JOURNAL_DISABLED_TEXT = 'events journal is disabled'

export interface DayGroups<T> {
  today: T[]
  yesterday: T[]
  earlier: T[]
}

/** Splits items into today, yesterday and earlier by local calendar day. */
export function groupByDay<T extends { ts: string }>(
  items: T[],
  now: Date,
): DayGroups<T> {
  const dayStart = (offset: number) =>
    new Date(
      now.getFullYear(),
      now.getMonth(),
      now.getDate() + offset,
    ).getTime()
  const todayStart = dayStart(0)
  const yesterdayStart = dayStart(-1)
  const groups: DayGroups<T> = { today: [], yesterday: [], earlier: [] }
  for (const item of items) {
    const time = Date.parse(item.ts)
    if (time >= todayStart) groups.today.push(item)
    else if (time >= yesterdayStart) groups.yesterday.push(item)
    else groups.earlier.push(item)
  }
  return groups
}
