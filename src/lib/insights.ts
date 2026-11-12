import { addDays, startOfWeek } from 'date-fns'

import { isGate } from './lease.ts'
import { isOverdue } from './schedule.ts'
import { mapStatus } from './types.ts'

import type { Bead } from './types.ts'

const DAY_MS = 86_400_000

export interface WeekBucket {
  start: Date
  created: number
  closed: number
}

export interface BurnPoint {
  end: Date
  scope: number
  done: number
}

export interface TypeCycle {
  type: string
  days: number
  count: number
}

export interface InsightsSummary {
  /** Beads closed per week in the range. */
  perWeek: number
  /** Beads closed per week in the range before it. */
  perWeekPrev: number
  medianDays: number | null
  medianDaysPrev: number | null
  /** Open beads at P0 or P1. */
  openUrgent: number
  overdue: number
}

function time(value: string | undefined): number | undefined {
  if (!value) return undefined
  const parsed = Date.parse(value)
  return Number.isNaN(parsed) ? undefined : parsed
}

/** Days from `started_at` to `closed_at`; undefined when either is missing or inverted. */
function cycleDays(bead: Bead): number | undefined {
  const started = time(bead.started_at)
  const closed = time(bead.closed_at)
  if (started === undefined || closed === undefined || closed < started) {
    return undefined
  }
  return (closed - started) / DAY_MS
}

function median(values: number[]): number | null {
  if (values.length === 0) return null
  const sorted = [...values].sort((a, b) => a - b)
  const mid = Math.floor(sorted.length / 2)
  if (sorted.length % 2 === 1) return sorted[mid]
  return (sorted[mid - 1] + sorted[mid]) / 2
}

/** `weeks` local-time Monday-start weeks, oldest first, ending with the week of `now`. */
function weekBuckets(now: Date, weeks: number): WeekBucket[] {
  const first = startOfWeek(now, { weekStartsOn: 1 })
  const buckets: WeekBucket[] = []
  for (let i = weeks - 1; i >= 0; i--) {
    buckets.push({ start: addDays(first, -7 * i), created: 0, closed: 0 })
  }
  return buckets
}

/** Index of the week containing `at`, or -1 when outside every bucket. */
function slotOf(buckets: WeekBucket[], at: number | undefined): number {
  if (at === undefined) return -1
  return buckets.findIndex(
    (b) => at >= b.start.getTime() && at < addDays(b.start, 7).getTime(),
  )
}

export function weeklyBuckets(
  beads: Bead[],
  now: Date,
  weeks: number,
): WeekBucket[] {
  const buckets = weekBuckets(now, weeks)
  for (const bead of beads.filter((b) => !isGate(b))) {
    const created = slotOf(buckets, time(bead.created_at))
    if (created >= 0) buckets[created].created++
    const closed = slotOf(buckets, time(bead.closed_at))
    if (closed >= 0) buckets[closed].closed++
  }
  return buckets
}

/** Cumulative scope (created) and done (closed) at the end of each week. */
export function burnUp(beads: Bead[], now: Date, weeks: number): BurnPoint[] {
  const work = beads.filter((b) => !isGate(b))
  return weekBuckets(now, weeks).map((bucket) => {
    const end = addDays(bucket.start, 7).getTime()
    let scope = 0
    let done = 0
    for (const bead of work) {
      const created = time(bead.created_at)
      if (created !== undefined && created < end) scope++
      const closed = time(bead.closed_at)
      if (closed !== undefined && closed < end) done++
    }
    return { end: new Date(end), scope, done }
  })
}

/** Median cycle days, optionally only for the given issue types; null when none qualify. */
export function medianCycleDays(
  beads: Bead[],
  types?: string[],
): number | null {
  const days: number[] = []
  for (const bead of beads) {
    if (isGate(bead)) continue
    if (types && !types.includes(bead.issue_type)) continue
    const d = cycleDays(bead)
    if (d !== undefined) days.push(d)
  }
  return median(days)
}

/** Median cycle days per issue type, slowest first. */
export function cycleByType(beads: Bead[]): TypeCycle[] {
  const byType = new Map<string, number[]>()
  for (const bead of beads) {
    if (isGate(bead)) continue
    const d = cycleDays(bead)
    if (d === undefined) continue
    const list = byType.get(bead.issue_type) ?? []
    list.push(d)
    byType.set(bead.issue_type, list)
  }
  return [...byType]
    .map(([type, days]) => ({
      type,
      days: median(days) ?? 0,
      count: days.length,
    }))
    .sort((a, b) => b.days - a.days)
}

/** -1, 0 or 1: the direction of `current` against `previous`. */
export function trend(current: number, previous: number): -1 | 0 | 1 {
  const diff = current - previous
  if (Math.abs(diff) < 1e-6) return 0
  return diff > 0 ? 1 : -1
}

/**
 * Pace over the last `weeks` weeks (ending with the week of `now`) against the
 * `weeks` before them. Stale work comes from `bd stale`, not from here.
 */
export function insightsSummary(
  beads: Bead[],
  weeks: number,
  now: Date,
): InsightsSummary {
  const work = beads.filter((b) => !isGate(b))
  const first = startOfWeek(now, { weekStartsOn: 1 })
  const curStart = addDays(first, -7 * (weeks - 1)).getTime()
  const curEnd = addDays(first, 7).getTime()
  const prevStart = addDays(new Date(curStart), -7 * weeks).getTime()
  const prevEnd = curStart

  const closedIn = (start: number, end: number): Bead[] =>
    work.filter((b) => {
      const at = time(b.closed_at)
      return at !== undefined && at >= start && at < end
    })
  const cur = closedIn(curStart, curEnd)
  const prev = closedIn(prevStart, prevEnd)

  return {
    perWeek: cur.length / weeks,
    perWeekPrev: prev.length / weeks,
    medianDays: medianCycleDays(cur),
    medianDaysPrev: medianCycleDays(prev),
    openUrgent: work.filter(
      (b) => mapStatus(b).column !== 'closed' && b.priority <= 1,
    ).length,
    overdue: work.filter((b) => isOverdue(b, now)).length,
  }
}
