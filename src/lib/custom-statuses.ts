import { BUILT_IN_STATUSES } from './types.ts'
import type { StatusCategory } from './types.ts'

/** Categories a custom status may be filed under (bd's `status.custom`). */
export const CUSTOM_STATUS_CATEGORIES = [
  'active',
  'wip',
  'done',
  'frozen',
] as const

export type CustomStatusCategory = (typeof CUSTOM_STATUS_CATEGORIES)[number]

export interface CustomStatusRow {
  name: string
  category: CustomStatusCategory
}

const NAME_RE = /^[a-z][a-z0-9_]*$/

function isCategory(value: string): value is CustomStatusCategory {
  return (CUSTOM_STATUS_CATEGORIES as readonly string[]).includes(value)
}

/** bd's built-in statuses and the category bd files each one under (`bd statuses`). */
export const BUILT_IN_CATEGORY: Record<string, StatusCategory> = {
  open: 'active',
  in_progress: 'wip',
  blocked: 'wip',
  deferred: 'frozen',
  closed: 'done',
  pinned: 'frozen',
  hooked: 'wip',
}

/** Splits a `status.custom` value into rows; a bare name is `active`, bd's default. */
export function parseCustomStatuses(value: string): CustomStatusRow[] {
  const rows: CustomStatusRow[] = []
  for (const segment of value.split(',')) {
    const parts = segment.trim().split(':')
    if (parts.length > 2) continue
    const [name, category = 'active'] = parts
    if (!name || !isCategory(category)) continue
    rows.push({ name, category })
  }
  return rows
}

/** Writes rows back as the comma-joined `name:category` form bd expects. */
export function serializeCustomStatuses(rows: CustomStatusRow[]): string {
  return rows.map((row) => `${row.name}:${row.category}`).join(',')
}

/** Null when the name can be added; otherwise the reason it cannot. */
export function validateStatusName(
  name: string,
  existing: readonly string[],
): string | null {
  if (!NAME_RE.test(name)) {
    return 'Use lowercase letters, digits and underscores, starting with a letter'
  }
  if (Object.hasOwn(BUILT_IN_STATUSES, name)) {
    return `${name} is a built-in status`
  }
  if (existing.includes(name)) {
    return `${name} is already a custom status`
  }
  return null
}

/** Null when a whole `status.custom` value is well formed and valid to save. */
export function validateCustomStatusList(value: string): string | null {
  const seen: string[] = []
  for (const segment of value.split(',')) {
    if (segment.trim() === '') {
      if (value.trim() === '') return null
      return 'Each status needs a name and a category'
    }
    const parts = segment.trim().split(':')
    if (parts.length > 2) {
      return 'Each status must look like name or name:category'
    }
    const [name, category = 'active'] = parts
    if (!isCategory(category)) {
      return `${category} is not a valid category`
    }
    const problem = validateStatusName(name, seen)
    if (problem) return problem
    seen.push(name)
  }
  return null
}
