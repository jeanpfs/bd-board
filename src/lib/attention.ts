import { isOverdue, dueState } from './schedule.ts'
import { isReady } from './sort.ts'
import { mapStatus, statusText } from './types.ts'

import type { Bead, Project } from './types.ts'

/** In-progress beads with no update for this many days count as stale. */
export const STALE_DAYS = 7
const DAY_MS = 24 * 60 * 60 * 1000

export type AttentionKind = 'p0' | 'overdue' | 'blocked' | 'stale'

export interface Attention {
  kind: AttentionKind
  bead: Bead
  /** One-line reason, e.g. `no update for 9 days`. */
  detail: string
}

const SEVERITY: Record<AttentionKind, number> = {
  p0: 0,
  overdue: 1,
  blocked: 2,
  stale: 3,
}

function timeOf(value?: string): number {
  const t = value ? Date.parse(value) : NaN
  return Number.isNaN(t) ? 0 : t
}

/** Why a bead needs someone now, or null. Closed beads never do. */
export function beadAttention(
  bead: Bead,
  now: number,
): Omit<Attention, 'bead'> | null {
  const status = mapStatus(bead)
  if (status.column === 'closed') return null
  if (bead.priority === 0) {
    return { kind: 'p0', detail: `P0 · ${statusText(bead)}` }
  }
  if (isOverdue(bead, new Date(now)) && bead.due_at) {
    return {
      kind: 'overdue',
      detail: dueState(bead.due_at, new Date(now)).label,
    }
  }
  if (status.column === 'blocked') {
    return { kind: 'blocked', detail: 'blocked' }
  }
  const updated = timeOf(bead.updated_at)
  if (status.column === 'in_progress' && updated > 0) {
    const days = Math.floor((now - updated) / DAY_MS)
    if (days >= STALE_DAYS) {
      return { kind: 'stale', detail: `no update for ${days} days` }
    }
  }
  return null
}

/** Beads that need attention, most severe first, then most urgent priority. */
export function attentionList(beads: Bead[], now: number): Attention[] {
  const items: Attention[] = []
  for (const bead of beads) {
    const hit = beadAttention(bead, now)
    if (hit) items.push({ ...hit, bead })
  }
  return items.sort(
    (a, b) =>
      SEVERITY[a.kind] - SEVERITY[b.kind] ||
      a.bead.priority - b.bead.priority ||
      timeOf(b.bead.updated_at) - timeOf(a.bead.updated_at),
  )
}

export interface ProjectProblem {
  kind: 'missing' | 'error' | 'migration'
  label: string
}

/** A project the board cannot read normally. */
export function projectProblem(project: Project): ProjectProblem | null {
  if (project.missing) {
    return { kind: 'missing', label: 'Folder no longer exists' }
  }
  if (project.error) {
    return { kind: 'error', label: project.error.split('\n')[0] }
  }
  if (project.migration) {
    const { currentVersion, latestVersion } = project.migration
    return {
      kind: 'migration',
      label: `Read-only · migration pending (v${currentVersion} → v${latestVersion})`,
    }
  }
  return null
}

export interface Headline {
  /** Highlighted number; null when the label says it all. */
  value: number | null
  label: string
  tone: 'danger' | 'warn' | 'default'
  /** Lower is more urgent; orders the project list. */
  rank: number
}

/**
 * The one number a project card leads with: a problem, then open P0s, then
 * overdue, then blocked, then ready to pick up, then open. `beads` is optional because a
 * project's bead list loads after its counts.
 */
export function projectHeadline(
  project: Project,
  beads?: Bead[],
  now: number = Date.now(),
): Headline {
  const problem = projectProblem(project)
  if (problem) {
    return {
      value: null,
      label: problem.label,
      tone: problem.kind === 'migration' ? 'warn' : 'danger',
      rank: 0,
    }
  }
  const p0 = beads
    ? beads.filter((b) => b.priority === 0 && mapStatus(b).column !== 'closed')
        .length
    : 0
  if (p0 > 0) return { value: p0, label: 'P0 open', tone: 'danger', rank: 1 }
  const overdue = beads
    ? beads.filter((b) => isOverdue(b, new Date(now))).length
    : 0
  if (overdue > 0) {
    return { value: overdue, label: 'overdue', tone: 'danger', rank: 2 }
  }
  const { counts } = project
  if (counts.blocked > 0) {
    return { value: counts.blocked, label: 'blocked', tone: 'danger', rank: 3 }
  }
  const ready = beads ? beads.filter(isReady).length : 0
  if (ready > 0) {
    return { value: ready, label: 'ready to pick up', tone: 'default', rank: 4 }
  }
  const open = counts.open + counts.deferred
  if (open > 0) return { value: open, label: 'open', tone: 'default', rank: 5 }
  return {
    value: null,
    label: counts.total > 0 ? 'All closed' : 'No beads yet',
    tone: 'default',
    rank: 6,
  }
}

/** Latest `updated_at` among the beads. */
export function lastActivity(beads: Bead[]): string | undefined {
  let latest: string | undefined
  for (const b of beads) {
    if (b.updated_at && timeOf(b.updated_at) > timeOf(latest)) {
      latest = b.updated_at
    }
  }
  return latest
}

/** Beads closed in the last seven days. */
export function closedThisWeek(beads: Bead[], now: number): number {
  return beads.filter(
    (b) =>
      mapStatus(b).column === 'closed' &&
      now - timeOf(b.closed_at ?? b.updated_at) < 7 * DAY_MS,
  ).length
}
