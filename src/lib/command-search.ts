import type { Bead, Project } from './types'

export interface CommandBeadItem {
  bead: Bead
  project: Project
  index: number
}

const BRANCH_SLUG_MAX = 48

/**
 * Where the match sits: 0 exact id, 1 id prefix, 2 title word prefix,
 * 3 title substring, null no match. An empty query matches everything.
 */
function rank(bead: Bead, query: string): number | null {
  if (!query) return 0
  const id = bead.id.toLowerCase()
  if (id === query) return 0
  if (id.startsWith(query)) return 1
  const hit = matchRange(bead.title, query)
  if (!hit) return null
  const [start] = hit
  const atWordStart = start === 0 || /\s/.test(bead.title[start - 1])
  return atWordStart ? 2 : 3
}

/**
 * Finds `query` in `text`, case-insensitively. A word prefix wins over a
 * substring; returns `[start, end)` or null.
 */
export function matchRange(
  text: string,
  query: string,
): [number, number] | null {
  const needle = query.trim().toLowerCase()
  if (!needle) return null
  const haystack = text.toLowerCase()
  const wordStarts = [
    0,
    ...Array.from(haystack.matchAll(/\s+/g), (m) => m.index + m[0].length),
  ]
  for (const start of wordStarts) {
    if (haystack.startsWith(needle, start)) {
      return [start, start + needle.length]
    }
  }
  const at = haystack.indexOf(needle)
  return at === -1 ? null : [at, at + needle.length]
}

/**
 * Ranks beads for the palette: closed beads last, then the scoped project,
 * then match rank (exact id, id prefix, title word prefix, title substring),
 * then input order.
 */
export function searchBeads(
  query: string,
  items: CommandBeadItem[],
  scopeProject?: string,
  limit = 6,
): CommandBeadItem[] {
  const needle = query.trim().toLowerCase()
  const scored: { item: CommandBeadItem; rank: number }[] = []
  for (const item of items) {
    const r = rank(item.bead, needle)
    if (r !== null) scored.push({ item, rank: r })
  }
  scored.sort(
    (a, b) =>
      Number(a.item.bead.status === 'closed') -
        Number(b.item.bead.status === 'closed') ||
      Number(b.item.project.id === scopeProject) -
        Number(a.item.project.id === scopeProject) ||
      a.rank - b.rank ||
      a.item.index - b.item.index,
  )
  return scored.slice(0, limit).map((s) => s.item)
}

/** `<id>-<slug of title>`, lowercased ascii, hyphens, slug capped at 48. */
export function branchName(bead: Pick<Bead, 'id' | 'title'>): string {
  const slug = bead.title
    .normalize('NFKD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, BRANCH_SLUG_MAX)
    .replace(/-+$/, '')
  const id = bead.id.toLowerCase()
  return slug ? `${id}-${slug}` : id
}
