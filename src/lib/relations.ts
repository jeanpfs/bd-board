import type { RelatedBead } from './types'

export const RELATION_KINDS = [
  'blocked-by',
  'blocks',
  'relates-to',
  'duplicate-of',
  'supersedes',
] as const

export type RelationKind = (typeof RELATION_KINDS)[number]

export type RemovableRelationKind = 'blocked-by' | 'blocks' | 'relates-to'

const REMOVABLE: Record<RelationKind, boolean> = {
  'blocked-by': true,
  blocks: true,
  'relates-to': true,
  'duplicate-of': false,
  supersedes: false,
}

export function isRelationKind(value: unknown): value is RelationKind {
  return (RELATION_KINDS as readonly unknown[]).includes(value)
}

export function isRemovableRelation(
  kind: RelationKind,
): kind is RemovableRelationKind {
  return REMOVABLE[kind]
}

/** Arguments after `bd` for creating `kind` from `id` to `target`. */
export function buildAddRelationArgs(
  kind: RelationKind,
  id: string,
  target: string,
): string[] {
  switch (kind) {
    case 'blocked-by':
      return ['dep', 'add', id, target]
    case 'blocks':
      return ['dep', 'add', target, id]
    case 'relates-to':
      return ['dep', 'relate', id, target]
    case 'duplicate-of':
      return ['duplicate', id, '--of', target]
    case 'supersedes':
      return ['supersede', target, '--with', id]
  }
}

/** Arguments after `bd` for removing an edge created by `buildAddRelationArgs`. */
export function buildRemoveRelationArgs(
  kind: RemovableRelationKind,
  id: string,
  target: string,
): string[] {
  switch (kind) {
    case 'blocked-by':
      return ['dep', 'remove', id, target]
    case 'blocks':
      return ['dep', 'remove', target, id]
    case 'relates-to':
      return ['dep', 'unrelate', id, target]
  }
}

export function relationCommandPreview(
  kind: RelationKind,
  id: string,
  target: string,
): string {
  return ['bd', ...buildAddRelationArgs(kind, id, target)].join(' ')
}

export interface RelationGroups {
  blockedBy: RelatedBead[]
  blocks: RelatedBead[]
  related: RelatedBead[]
}

/**
 * `dependencies` are the beads this bead points at, `dependents` the beads
 * pointing at it. Parent-child edges are left out: the hierarchy shows them.
 * A relates-to edge is stored on both beads, so it is listed once.
 */
export function groupRelations(
  dependencies: RelatedBead[] = [],
  dependents: RelatedBead[] = [],
): RelationGroups {
  const blockedBy = dependencies.filter((d) => d.dependency_type === 'blocks')
  const blocks = dependents.filter((d) => d.dependency_type === 'blocks')

  const seen = new Set<string>()
  const related: RelatedBead[] = []
  for (const bead of [...dependencies, ...dependents]) {
    if (bead.dependency_type === 'blocks') continue
    if (bead.dependency_type === 'parent-child') continue
    const key = `${bead.id}|${bead.dependency_type}`
    if (seen.has(key)) continue
    seen.add(key)
    related.push(bead)
  }

  return { blockedBy, blocks, related }
}
