import type { Bead } from './types'

export interface LabelCount {
  label: string
  count: number
}

export interface LabelSuggestions {
  /** Offered as "create" only when the typed text is a new, valid label. */
  create?: string
  matches: LabelCount[]
}

/** Server rule for every label: bd accepts nothing else. */
export const LABEL_RE = /^[A-Za-z0-9][A-Za-z0-9_.-]{0,63}$/

const MAX_NEW_LABEL_LENGTH = 50

function byCountThenName(a: LabelCount, b: LabelCount): number {
  return b.count - a.count || a.label.localeCompare(b.label)
}

/** Each bead counts once per label; most used first, ties by name. */
export function labelCounts(beads: Bead[]): LabelCount[] {
  const counts = new Map<string, number>()
  for (const bead of beads) {
    for (const label of new Set(bead.labels ?? [])) {
      counts.set(label, (counts.get(label) ?? 0) + 1)
    }
  }
  return Array.from(counts, ([label, count]) => ({ label, count })).sort(
    byCountThenName,
  )
}

/**
 * Suggests labels for the typed text. Prefix matches come before substring
 * matches; both are case-insensitive and exclude already selected labels.
 */
export function suggestLabels(
  input: string,
  counts: LabelCount[],
  selected: string[],
): LabelSuggestions {
  const query = input.trim()
  const needle = query.toLowerCase()
  const taken = new Set(selected.map((label) => label.toLowerCase()))
  const candidates = counts.filter((c) => !taken.has(c.label.toLowerCase()))

  const prefix: LabelCount[] = []
  const substring: LabelCount[] = []
  for (const candidate of candidates) {
    const lower = candidate.label.toLowerCase()
    if (lower.startsWith(needle)) prefix.push(candidate)
    else if (lower.includes(needle)) substring.push(candidate)
  }
  prefix.sort(byCountThenName)
  substring.sort(byCountThenName)

  const known = counts.some((c) => c.label.toLowerCase() === needle)
  const validNew = LABEL_RE.test(query) && query.length <= MAX_NEW_LABEL_LENGTH
  const create = validNew && !known && !taken.has(needle) ? query : undefined

  return { create, matches: [...prefix, ...substring] }
}

/**
 * The label the typed text stands for when the user leaves the field:
 * a valid new label, or the existing label it matches case-insensitively.
 */
export function labelToCommit(
  input: string,
  counts: LabelCount[],
  selected: string[],
): string | undefined {
  const { create } = suggestLabels(input, counts, selected)
  if (create) return create
  const needle = input.trim().toLowerCase()
  if (!needle) return undefined
  const existing = counts.find((c) => c.label.toLowerCase() === needle)
  return existing && !selected.includes(existing.label)
    ? existing.label
    : undefined
}
