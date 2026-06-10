import type { Bead } from './types'

export type SortKey = 'priority' | 'recent' | 'title'

export const SORT_OPTIONS: { key: SortKey; label: string }[] = [
  { key: 'priority', label: 'Priority' },
  { key: 'recent', label: 'Most recent' },
  { key: 'title', label: 'Title' },
]

export const PRIORITIES = [0, 1, 2, 3, 4]

export function priorityLabel(p: number): string {
  return `P${Math.max(0, Math.min(4, p))}`
}

export function clampPriority(p: number): number {
  return Math.max(0, Math.min(4, Number.isFinite(p) ? p : 4))
}

function prio(b: Bead): number {
  return Number.isFinite(b.priority) ? b.priority : 9
}

function timeOf(b: Bead): number {
  const raw = b.updated_at ?? b.created_at
  if (!raw) return 0
  const t = Date.parse(raw)
  return Number.isNaN(t) ? 0 : t
}

export function compareBeads(sort: SortKey): (a: Bead, b: Bead) => number {
  return (a, b) => {
    if (sort === 'recent')
      return timeOf(b) - timeOf(a) || a.id.localeCompare(b.id)
    if (sort === 'title')
      return a.title.localeCompare(b.title) || prio(a) - prio(b)
    return prio(a) - prio(b) || a.id.localeCompare(b.id)
  }
}

export function beadMatches(
  bead: Bead,
  search: string,
  priorities: number[],
): boolean {
  if (
    priorities.length > 0 &&
    !priorities.includes(clampPriority(bead.priority))
  ) {
    return false
  }
  const q = search.trim().toLowerCase()
  if (
    q &&
    !(bead.id.toLowerCase().includes(q) || bead.title.toLowerCase().includes(q))
  ) {
    return false
  }
  return true
}
