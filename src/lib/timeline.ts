import {
  addDays,
  addMonths,
  addQuarters,
  differenceInCalendarDays,
  format,
  startOfDay,
  startOfMonth,
  startOfQuarter,
  startOfWeek,
} from 'date-fns'

import { isGate } from './lease'
import { buildChildrenMap } from './tree'
import { isEpic, mapStatus } from './types'

import type { Bead } from './types'

/** An at-risk epic has less than this share of its planned window left with nothing closed. */
const WINDOW_RISK_FRACTION = 0.25

export interface TimelineChild {
  bead: Bead
  due?: Date
}

export interface EpicSpan {
  epic: Bead
  start?: Date
  due?: Date
  done: number
  total: number
  atRisk: boolean
  children: TimelineChild[]
}

export type TickUnit = 'week' | 'month' | 'quarter'

export interface TimeRange {
  start: Date
  end: Date
}

function parseDate(value?: string): Date | undefined {
  return value ? new Date(value) : undefined
}

function isClosed(bead: Bead): boolean {
  return mapStatus(bead).column === 'closed'
}

function earliest(dates: (Date | undefined)[]): Date | undefined {
  let min: Date | undefined
  for (const date of dates) {
    if (date && (!min || date < min)) min = date
  }
  return min
}

function isAtRisk(input: {
  start?: Date
  due?: Date
  done: number
  total: number
  now: Date
}): boolean {
  const { start, due, done, total, now } = input
  if (!due || !start || done >= total) return false

  if (done === 0) {
    const window = due.getTime() - start.getTime()
    if (window <= 0) return true
    return due.getTime() - now.getTime() < WINDOW_RISK_FRACTION * window
  }

  const elapsed = now.getTime() - start.getTime()
  const projectedFinish = start.getTime() + (elapsed * total) / done
  return projectedFinish > due.getTime()
}

function buildSpan(epic: Bead, children: Bead[], now: Date): EpicSpan {
  const done = children.filter(isClosed).length
  const total = children.length
  const start = earliest(
    [epic, ...children].map((bead) => parseDate(bead.started_at)),
  )
  const due = parseDate(epic.due_at)
  return {
    epic,
    start,
    due,
    done,
    total,
    atRisk: isAtRisk({ start, due, done, total, now }),
    children: children.map((bead) => ({ bead, due: parseDate(bead.due_at) })),
  }
}

function byDue(a: EpicSpan, b: EpicSpan): number {
  if (a.due && b.due) return a.due.getTime() - b.due.getTime()
  if (a.due) return -1
  if (b.due) return 1
  return 0
}

/**
 * One row per open epic. The bar runs from the earliest `started_at` among the
 * epic and its children to its `due_at`. Epics with a due date come first.
 */
export function epicSpans(beads: Bead[], now: Date): EpicSpan[] {
  const live = beads.filter((bead) => !isGate(bead))
  const childrenOf = buildChildrenMap(live)
  return live
    .filter((bead) => isEpic(bead) && !isClosed(bead))
    .map((epic) => buildSpan(epic, childrenOf.get(epic.id) ?? [], now))
    .sort(byDue)
}

/**
 * Tick dates within `range`: Mondays for weeks, the 1st for months, and the
 * 1st of Jan/Apr/Jul/Oct for quarters. Each is local midnight.
 */
export function scaleTicks(range: TimeRange, unit: TickUnit): Date[] {
  const start = startOfDay(range.start)
  const end = range.end
  if (start > end) return []

  const ticks: Date[] = []
  let cursor =
    unit === 'week'
      ? startOfWeek(start, { weekStartsOn: 1 })
      : unit === 'month'
        ? startOfMonth(start)
        : startOfQuarter(start)

  while (cursor <= end) {
    if (cursor >= start) ticks.push(cursor)
    if (unit === 'week') cursor = addDays(cursor, 7)
    else if (unit === 'month') cursor = addMonths(cursor, 1)
    else cursor = addQuarters(cursor, 1)
  }
  return ticks
}

/** Child due days that count as "soon" and get the warn colour. */
const SOON_DAYS = 7

/**
 * Text for a child's due diamond. `soon` means due within a week (or overdue),
 * which gets the warn colour plus this text, never colour alone.
 */
export function childDueLabel(
  due: Date,
  now: Date,
): { text: string; soon: boolean } {
  const days = differenceInCalendarDays(due, now)
  const date = format(due, 'MMM d')
  if (days < 0) return { text: `due ${date} · overdue ${-days}d`, soon: true }
  if (days === 0) return { text: `due ${date} · today`, soon: true }
  if (days === 1) return { text: `due ${date} · tomorrow`, soon: true }
  if (days <= SOON_DAYS) {
    return { text: `due ${date} · in ${days} days`, soon: true }
  }
  return { text: `due ${date}`, soon: false }
}

/** Epic counts for the timeline summary line. */
export function timelineSummary(spans: Pick<EpicSpan, 'due' | 'atRisk'>[]): {
  dated: number
  undated: number
  atRisk: number
} {
  const dated = spans.filter((s) => s.due !== undefined).length
  return {
    dated,
    undated: spans.length - dated,
    atRisk: spans.filter((s) => s.atRisk).length,
  }
}
