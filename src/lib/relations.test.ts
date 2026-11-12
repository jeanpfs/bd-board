import { describe, expect, it } from 'vitest'

import {
  buildAddRelationArgs,
  buildRemoveRelationArgs,
  groupRelations,
  isRemovableRelation,
  relationCommandPreview,
} from './relations'

import type { RelatedBead } from './types'

const related = (
  id: string,
  dependency_type: string,
  status = 'open',
): RelatedBead => ({
  id,
  title: `Bead ${id}`,
  status,
  issue_type: 'task',
  dependency_type,
})

describe('buildAddRelationArgs', () => {
  it('blocked-by makes the bead depend on the target', () => {
    expect(buildAddRelationArgs('blocked-by', 'bd-a', 'bd-b')).toEqual([
      'dep',
      'add',
      'bd-a',
      'bd-b',
    ])
  })

  it('blocks makes the target depend on the bead', () => {
    expect(buildAddRelationArgs('blocks', 'bd-a', 'bd-b')).toEqual([
      'dep',
      'add',
      'bd-b',
      'bd-a',
    ])
  })

  it('relates-to uses dep relate', () => {
    expect(buildAddRelationArgs('relates-to', 'bd-a', 'bd-b')).toEqual([
      'dep',
      'relate',
      'bd-a',
      'bd-b',
    ])
  })

  it('duplicate-of marks the bead as a duplicate of the target', () => {
    expect(buildAddRelationArgs('duplicate-of', 'bd-a', 'bd-b')).toEqual([
      'duplicate',
      'bd-a',
      '--of',
      'bd-b',
    ])
  })

  it('supersedes closes the target in favour of the bead', () => {
    expect(buildAddRelationArgs('supersedes', 'bd-a', 'bd-b')).toEqual([
      'supersede',
      'bd-b',
      '--with',
      'bd-a',
    ])
  })
})

describe('buildRemoveRelationArgs', () => {
  it('blocked-by removes the bead to target edge', () => {
    expect(buildRemoveRelationArgs('blocked-by', 'bd-a', 'bd-b')).toEqual([
      'dep',
      'remove',
      'bd-a',
      'bd-b',
    ])
  })

  it('blocks removes the target to bead edge', () => {
    expect(buildRemoveRelationArgs('blocks', 'bd-a', 'bd-b')).toEqual([
      'dep',
      'remove',
      'bd-b',
      'bd-a',
    ])
  })

  it('relates-to uses dep unrelate', () => {
    expect(buildRemoveRelationArgs('relates-to', 'bd-a', 'bd-b')).toEqual([
      'dep',
      'unrelate',
      'bd-a',
      'bd-b',
    ])
  })

  it('only blocked-by, blocks and relates-to can be removed', () => {
    expect(isRemovableRelation('blocked-by')).toBe(true)
    expect(isRemovableRelation('blocks')).toBe(true)
    expect(isRemovableRelation('relates-to')).toBe(true)
    expect(isRemovableRelation('duplicate-of')).toBe(false)
    expect(isRemovableRelation('supersedes')).toBe(false)
  })
})

describe('relationCommandPreview', () => {
  it('shows the bd command that the add will run', () => {
    expect(relationCommandPreview('blocked-by', 'bd-a', 'bd-b')).toBe(
      'bd dep add bd-a bd-b',
    )
    expect(relationCommandPreview('supersedes', 'bd-a', 'bd-b')).toBe(
      'bd supersede bd-b --with bd-a',
    )
  })
})

describe('groupRelations', () => {
  it('splits blocking edges by direction', () => {
    const groups = groupRelations(
      [related('bd-up', 'blocks')],
      [related('bd-down', 'blocks')],
    )
    expect(groups.blockedBy.map((b) => b.id)).toEqual(['bd-up'])
    expect(groups.blocks.map((b) => b.id)).toEqual(['bd-down'])
    expect(groups.related).toEqual([])
  })

  it('lists a relates-to link once even though both sides carry it', () => {
    const groups = groupRelations(
      [related('bd-b', 'relates-to')],
      [related('bd-b', 'relates-to')],
    )
    expect(groups.related.map((b) => b.id)).toEqual(['bd-b'])
  })

  it('keeps duplicates in related with their kind and leaves out parent-child', () => {
    const groups = groupRelations(
      [related('bd-parent', 'parent-child'), related('bd-canon', 'duplicates')],
      [related('bd-child', 'parent-child')],
    )
    expect(groups.blockedBy).toEqual([])
    expect(groups.blocks).toEqual([])
    expect(groups.related).toEqual([related('bd-canon', 'duplicates')])
  })

  it('returns empty groups when nothing is linked', () => {
    expect(groupRelations()).toEqual({
      blockedBy: [],
      blocks: [],
      related: [],
    })
  })
})
