import { differenceInCalendarDays, format } from 'date-fns'

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
  if (days <= 7) return { kind: 'soon', label: format(due, 'EEE') }
  return { kind: 'later', label: format(due, 'MMM d') }
}

export interface QuickDue {
  label: 'Today' | 'Tomorrow' | 'Next Monday' | 'In 2 weeks'
  value: string
}

/** Quick due presets; `value` is what `bd update --due` receives. */
export const QUICK_DUE: QuickDue[] = [
  { label: 'Today', value: localDateParam(new Date()) },
  { label: 'Tomorrow', value: 'tomorrow' },
  { label: 'Next Monday', value: 'next monday' },
  { label: 'In 2 weeks', value: '+2w' },
]
