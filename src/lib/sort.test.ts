import { describe, expect, it } from 'vitest'

import { beadMatches, clampPriority, compareBeads, priorityLabel } from './sort'

import type { Bead } from './types'

function bead(overrides: Partial<Bead>): Bead {
  return {
    id: 'bd-board-a',
    title: 'Alpha',
    status: 'open',
    priority: 2,
    issue_type: 'task',
    labels: [],
    ...overrides,
  }
}

describe('priority helpers', () => {
  it('clamps priorities into the bd priority range', () => {
    expect(clampPriority(-1)).toBe(0)
    expect(clampPriority(2)).toBe(2)
    expect(clampPriority(99)).toBe(4)
    expect(clampPriority(Number.NaN)).toBe(4)
  })

  it('formats priorities', () => {
    expect(priorityLabel(-1)).toBe('P0')
    expect(priorityLabel(3)).toBe('P3')
    expect(priorityLabel(99)).toBe('P4')
  })
})

describe('compareBeads', () => {
  it('sorts by priority first by default', () => {
    const items = [
      bead({ id: 'bd-board-c', priority: 3 }),
      bead({ id: 'bd-board-a', priority: 1 }),
      bead({ id: 'bd-board-b', priority: 1 }),
    ]
      .slice()
      .sort(compareBeads('priority'))

    expect(items.map((item) => item.id)).toEqual([
      'bd-board-a',
      'bd-board-b',
      'bd-board-c',
    ])
  })

  it('sorts recent beads by updated time descending', () => {
    const items = [
      bead({ id: 'older', updated_at: '2026-01-01T00:00:00Z' }),
      bead({ id: 'newer', updated_at: '2026-02-01T00:00:00Z' }),
    ]
      .slice()
      .sort(compareBeads('recent'))

    expect(items.map((item) => item.id)).toEqual(['newer', 'older'])
  })

  it('sorts by title alphabetically', () => {
    const items = [
      bead({ id: 'b', title: 'Zulu' }),
      bead({ id: 'a', title: 'Alpha' }),
    ]
      .slice()
      .sort(compareBeads('title'))

    expect(items.map((item) => item.title)).toEqual(['Alpha', 'Zulu'])
  })
})

describe('beadMatches', () => {
  it('matches id and title search', () => {
    expect(
      beadMatches(bead({ id: 'bd-board-x1', title: 'Fix modal' }), 'modal', []),
    ).toBe(true)
    expect(
      beadMatches(bead({ id: 'bd-board-x1', title: 'Fix modal' }), 'x1', []),
    ).toBe(true)
    expect(
      beadMatches(
        bead({ id: 'bd-board-x1', title: 'Fix modal' }),
        'kanban',
        [],
      ),
    ).toBe(false)
  })

  it('filters priorities', () => {
    expect(beadMatches(bead({ priority: 0 }), '', [0, 1])).toBe(true)
    expect(beadMatches(bead({ priority: 4 }), '', [0, 1])).toBe(false)
  })
})
