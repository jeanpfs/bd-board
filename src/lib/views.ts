import { SORT_OPTIONS } from './sort'

import type { SortKey } from './sort'

export type ViewGroupBy = 'status' | 'priority' | 'epic'

export const VIEW_GROUP_OPTIONS: { key: ViewGroupBy; label: string }[] = [
  { key: 'status', label: 'Status' },
  { key: 'priority', label: 'Priority' },
  { key: 'epic', label: 'Epic' },
]

export const DEFAULT_VIEW_GROUP: ViewGroupBy = 'status'
export const DEFAULT_VIEW_SORT: SortKey = 'priority'

export interface SavedView {
  id: string
  name: string
  query: string
  shared: boolean
  /** Absent on views saved before grouping existed; treated as status. */
  groupBy?: ViewGroupBy
  /** Absent on older views; treated as priority. */
  sort?: SortKey
}

export function parseViewGroup(value: unknown): ViewGroupBy | undefined {
  return VIEW_GROUP_OPTIONS.find((o) => o.key === value)?.key
}

export function parseViewSort(value: unknown): SortKey | undefined {
  return SORT_OPTIONS.find((o) => o.key === value)?.key
}

/** bd kv key holding the shared views array (JSON string). */
export const VIEWS_KV_KEY = 'bd-board.views'

export const QUERY_MAX_LENGTH = 500
export const VIEW_NAME_MAX_LENGTH = 60

const VIEW_ID_RE = /^[a-z0-9][a-z0-9-]{0,63}$/

export function isViewId(value: unknown): value is string {
  return typeof value === 'string' && VIEW_ID_RE.test(value)
}

/** Returns a human message when the query text cannot be sent to bd, else null. */
export function queryTextError(query: string): string | null {
  const trimmed = query.trim()
  if (!trimmed) return 'Query is required.'
  if (trimmed.length > QUERY_MAX_LENGTH) {
    return `Query must be ${QUERY_MAX_LENGTH} characters or fewer.`
  }
  if (/[\r\n]/.test(trimmed)) return 'Query must be a single line.'
  if (trimmed.startsWith('-')) return 'Query cannot start with "-".'
  return null
}

/**
 * Parses the stored views JSON. Invalid entries are dropped so one bad record
 * never hides the rest.
 */
export function parseViews(json: string): SavedView[] {
  let raw: unknown
  try {
    raw = JSON.parse(json)
  } catch {
    return []
  }
  if (!Array.isArray(raw)) return []

  const views: SavedView[] = []
  for (const entry of raw) {
    if (typeof entry !== 'object' || entry === null) continue
    const { id, name, query, shared, groupBy, sort } = entry as Record<
      string,
      unknown
    >
    if (!isViewId(id)) continue
    if (typeof name !== 'string' || !name.trim()) continue
    if (typeof query !== 'string' || queryTextError(query) !== null) continue
    const view: SavedView = {
      id,
      name: name.trim(),
      query: query.trim(),
      shared: shared === true,
    }
    const g = parseViewGroup(groupBy)
    if (g) view.groupBy = g
    const o = parseViewSort(sort)
    if (o) view.sort = o
    views.push(view)
  }
  return views
}

/** Shared views first, then personal. A shared view wins over a personal one with the same id. */
export function mergeViews(
  shared: SavedView[],
  personal: SavedView[],
): SavedView[] {
  const seen = new Set<string>()
  const merged: SavedView[] = []
  for (const view of [...shared, ...personal]) {
    if (seen.has(view.id)) continue
    seen.add(view.id)
    merged.push(view)
  }
  return merged
}

/** Slug from the name, made unique against existing ids with a numeric suffix. */
export function newViewId(name: string, existing: Iterable<string>): string {
  const taken = new Set(existing)
  const base =
    name
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, '-')
      .replace(/^-+|-+$/g, '')
      .slice(0, 48)
      .replace(/-+$/, '') || 'view'
  if (!taken.has(base)) return base
  let n = 2
  while (taken.has(`${base}-${n}`)) n += 1
  return `${base}-${n}`
}

export function personalViewsKey(project: string): string {
  return `bd-board:views:${project}`
}
