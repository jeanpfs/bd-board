import { relativeDate } from './time.ts'

import type {
  Bead,
  BlockedRow,
  BlockerRef,
  ReadyExplain,
  ReadyRow,
} from './types.ts'

type Raw = Record<string, unknown>

function isRaw(value: unknown): value is Raw {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
}

function text(raw: Raw, key: string): string | undefined {
  const value = raw[key]
  return typeof value === 'string' && value ? value : undefined
}

function count(raw: Raw, key: string): number | undefined {
  const value = raw[key]
  return typeof value === 'number' ? value : undefined
}

function mapBead(raw: Raw): Bead | null {
  const id = text(raw, 'id')
  if (!id) return null
  const fields: Partial<Bead> = {
    description: text(raw, 'description'),
    assignee: text(raw, 'assignee'),
    created_at: text(raw, 'created_at'),
    updated_at: text(raw, 'updated_at'),
    parent: text(raw, 'parent'),
    due_at: text(raw, 'due_at'),
    defer_until: text(raw, 'defer_until'),
    external_ref: text(raw, 'external_ref'),
    dependency_count: count(raw, 'dependency_count'),
    dependent_count: count(raw, 'dependent_count'),
    estimated_minutes: count(raw, 'estimated_minutes'),
  }
  const entries: [string, unknown][] = Object.entries(fields)
  const present = Object.fromEntries(
    entries.filter(([, value]) => value !== undefined),
  )
  return {
    id,
    title: text(raw, 'title') ?? id,
    status: text(raw, 'status') ?? 'open',
    priority: count(raw, 'priority') ?? 2,
    issue_type: text(raw, 'issue_type') ?? 'task',
    labels: Array.isArray(raw['labels'])
      ? raw['labels'].filter((l): l is string => typeof l === 'string')
      : [],
    ...present,
  }
}

function mapBlocker(raw: unknown): BlockerRef | null {
  if (!isRaw(raw)) return null
  const id = text(raw, 'id')
  if (!id) return null
  return {
    id,
    title: text(raw, 'title') ?? id,
    status: text(raw, 'status') ?? 'open',
    priority: count(raw, 'priority') ?? 2,
  }
}

function rows(value: unknown): Raw[] {
  return Array.isArray(value) ? value.filter(isRaw) : []
}

/** Shapes `bd ready --explain --json`; absent arrays are empty, malformed rows skipped. */
export function parseReadyExplain(raw: unknown): ReadyExplain {
  const data = isRaw(raw) ? raw : {}
  const ready: ReadyRow[] = []
  for (const row of rows(data['ready'])) {
    const bead = mapBead(row)
    if (!bead) continue
    ready.push({
      ...bead,
      reason: text(row, 'reason') ?? '',
      resolved_blockers: Array.isArray(row['resolved_blockers'])
        ? row['resolved_blockers'].filter(
            (id): id is string => typeof id === 'string',
          )
        : [],
    })
  }
  const blocked: BlockedRow[] = []
  for (const row of rows(data['blocked'])) {
    const bead = mapBead(row)
    if (!bead) continue
    const list = Array.isArray(row['blocked_by']) ? row['blocked_by'] : []
    blocked.push({
      ...bead,
      blocked_by: list.flatMap((b) => mapBlocker(b) ?? []),
    })
  }
  return { ready, blocked }
}

export type NotReadyRow =
  | { kind: 'blocked'; bead: BlockedRow }
  | { kind: 'snoozed'; bead: Bead }

/** Blocked rows first, then snoozed (deferred) beads that are not already listed. */
export function splitNotReady(
  blocked: BlockedRow[],
  beads: Bead[],
): NotReadyRow[] {
  const listed = new Set(blocked.map((b) => b.id))
  return [
    ...blocked.map((bead): NotReadyRow => ({ kind: 'blocked', bead })),
    ...beads
      .filter((b) => b.status === 'deferred' && !listed.has(b.id))
      .map((bead): NotReadyRow => ({ kind: 'snoozed', bead })),
  ]
}

/** `unblocked 2 hours ago` from the latest closed blocker; `no blockers` when unknown. */
export function unblockedLabel(
  resolved: string[],
  byId: Map<string, Bead>,
  now: Date,
): string {
  let latest = 0
  for (const id of resolved) {
    const closed = byId.get(id)?.closed_at
    const time = closed ? new Date(closed).getTime() : Number.NaN
    if (time > latest) latest = time
  }
  if (!latest) return 'no blockers'
  const ago = relativeDate(new Date(latest).toISOString(), now)
  return `unblocked ${ago}`
}

/** bd refuses a claim held by someone else: `issue already claimed by <actor>`. */
export function claimErrorMessage(stderr: string): string | null {
  const match = /already claimed by (\S+)/.exec(stderr)
  return match ? `Already claimed by ${match[1]}` : null
}
