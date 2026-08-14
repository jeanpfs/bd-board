import { describe, expect, it } from 'vitest'

import { buildChildrenMap, getRootBeads } from './tree'

import type { Bead } from './types'

function bead(overrides: Partial<Bead>): Bead {
  return {
    id: 'bd-board-a',
    title: 'Alpha',
    status: 'open',
    priority: 2,
    issue_type: 'task',
    ...overrides,
  }
}

describe('buildChildrenMap', () => {
  it('groups beads by their parent id', () => {
    const epic = bead({ id: 'e1', issue_type: 'epic' })
    const task = bead({ id: 't1', parent: 'e1' })
    const subtask = bead({ id: 's1', parent: 't1' })
    const other = bead({ id: 't2', parent: 'e1' })

    const map = buildChildrenMap([epic, task, subtask, other])

    expect(map.get('e1')).toEqual([task, other])
    expect(map.get('t1')).toEqual([subtask])
    expect(map.has('s1')).toBe(false)
  })

  it('omits beads without a parent', () => {
    const root = bead({ id: 'r1' })
    const map = buildChildrenMap([root])
    expect(map.size).toBe(0)
  })
})

describe('getRootBeads', () => {
  it('returns beads with no parent, epic or not', () => {
    const epic = bead({ id: 'e1', issue_type: 'epic' })
    const task = bead({ id: 't1', parent: 'e1' })
    const looseTask = bead({ id: 't2' })

    expect(getRootBeads([epic, task, looseTask])).toEqual([epic, looseTask])
  })

  it('returns an empty array when every bead has a parent', () => {
    const task = bead({ id: 't1', parent: 'e1' })
    expect(getRootBeads([task])).toEqual([])
  })

  it('returns an empty array for an empty input', () => {
    expect(getRootBeads([])).toEqual([])
  })
})
