import { addDays, differenceInCalendarDays, format, startOfDay } from 'date-fns'

import { mapStatus } from './types'
import type { Bead } from './types'

/** `90`, `90m`, `3h`, `1h30m`, `1h 30m`, `1.5h` → minutes; null when invalid or ≤ 0. */
export function parseEstimate(text: string): number | null {
  const value = text.trim().toLowerCase()
  let minutes: number | null = null

  const hm = /^(\d+)h\s*(\d+)m$/.exec(value)
  const hours = /^(\d+(?:\.\d+)?)h$/.exec(value)
  const plain = /^(\d+)m?$/.exec(value)
  if (hm) minutes = Number(hm[1]) * 60 + Number(hm[2])
  else if (hours) minutes = Math.round(Number(hours[1]) * 60)
  else if (plain) minutes = Number(plain[1])

  if (minutes === null || !Number.isInteger(minutes) || minutes <= 0) {
    return null
  }
  return minutes
}

/** `45m`, `3h`, `1h 30m`. */
export function formatEstimate(min: number): string {
  const hours = Math.floor(min / 60)
  const minutes = min % 60
  if (hours === 0) return `${minutes}m`
  if (minutes === 0) return `${hours}h`
  return `${hours}h ${minutes}m`
}

/** `YYYY-MM-DD` for the local calendar day of `d`. */
export function localDateParam(d: Date): string {
  return format(d, 'yyyy-MM-dd')
}

export interface DueState {
  kind: 'overdue' | 'soon' | 'later'
  label: string
}

/**
 * Compares local calendar days, so a bead due earlier today reads `Today`
 * rather than overdue. Within a week the label is a day name; beyond it, the date.
 */
export function dueState(dueAt: string, now: Date): DueState {
  const due = new Date(dueAt)
  const days = differenceInCalendarDays(due, now)
  if (days < 0) return { kind: 'overdue', label: `Overdue ${-days}d` }
  if (days === 0) return { kind: 'soon', label: 'Today' }
  if (days === 1) return { kind: 'soon', label: 'Tomorrow' }
  if (days <= 6) return { kind: 'soon', label: format(due, 'EEE') }
  return { kind: 'later', label: format(due, 'MMM d') }
}

/** Open bead whose due day is before today's local calendar day. */
export function isOverdue(b: Bead, now: Date): boolean {
  if (!b.due_at || mapStatus(b).column === 'closed') return false
  return dueState(b.due_at, now).kind === 'overdue'
}

/** Open bead due today or within the next 6 days (7 local days), not overdue. */
export function isDueThisWeek(b: Bead, now: Date): boolean {
  if (!b.due_at || mapStatus(b).column === 'closed') return false
  const days = differenceInCalendarDays(new Date(b.due_at), now)
  return days >= 0 && days <= 6
}

export interface QuickDue {
  label: 'Today' | 'Tomorrow' | 'Next Monday' | 'In 2 weeks'
  /** What `bd update --due` / `bd defer --until` receives. */
  value: string
  /** Right-hand hint in the picker: weekday for the next two days, else the date. */
  hint: string
}

/** The next Monday strictly after `now`. */
function nextMonday(now: Date): Date {
  const daysAhead = (1 - now.getDay() + 7) % 7 || 7
  return addDays(startOfDay(now), daysAhead)
}

/**
 * Quick due presets relative to `now`. Pass the current time at render so
 * `Today` stays correct across midnight.
 */
export function quickDue(now: Date): QuickDue[] {
  const twoWeeks = addDays(startOfDay(now), 14)
  return [
    {
      label: 'Today',
      value: localDateParam(now),
      hint: format(now, 'EEE'),
    },
    {
      label: 'Tomorrow',
      value: 'tomorrow',
      hint: format(addDays(now, 1), 'EEE'),
    },
    {
      label: 'Next Monday',
      value: 'next monday',
      hint: format(nextMonday(now), 'MMM d'),
    },
    {
      label: 'In 2 weeks',
      value: '+2w',
      hint: format(twoWeeks, 'MMM d'),
    },
  ]
}
