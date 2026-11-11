import { describe, expect, it } from 'vitest'

import {
  beadMatches,
  clampPriority,
  compareBeads,
  isReady,
  priorityLabel,
} from './sort'

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

  it('filters to ready beads when requested', () => {
    const openUnblocked = bead({ status: 'open' })
    const openBlocked = bead({
      status: 'open',
      links: [{ id: 'bd-board-dep', type: 'blocks', direction: 'outgoing' }],
    })
    const inProgress = bead({ status: 'in_progress' })

    expect(beadMatches(openUnblocked, '', [], true)).toBe(true)
    expect(beadMatches(openBlocked, '', [], true)).toBe(false)
    expect(beadMatches(inProgress, '', [], true)).toBe(false)
    expect(beadMatches(openBlocked, '', [], false)).toBe(true)
  })

  it('filters by assignee when requested', () => {
    const mine = bead({ assignee: 'jean.pfs2@gmail.com' })
    const someoneElse = bead({ assignee: 'claude-agent' })
    const unassigned = bead({ assignee: undefined })

    expect(beadMatches(mine, '', [], false, 'jean.pfs2@gmail.com')).toBe(true)
    expect(beadMatches(someoneElse, '', [], false, 'jean.pfs2@gmail.com')).toBe(
      false,
    )
    expect(beadMatches(unassigned, '', [], false, 'jean.pfs2@gmail.com')).toBe(
      false,
    )
    expect(beadMatches(someoneElse, '', [], false, '')).toBe(true)
  })
})

describe('isReady', () => {
  it('is true only for open beads with no unresolved blocked-by link', () => {
    expect(isReady(bead({ status: 'open' }))).toBe(true)
    expect(
      isReady(
        bead({
          status: 'open',
          links: [
            { id: 'bd-board-dep', type: 'blocks', direction: 'outgoing' },
          ],
        }),
      ),
    ).toBe(false)
    expect(isReady(bead({ status: 'blocked' }))).toBe(false)
    expect(isReady(bead({ status: 'closed' }))).toBe(false)
    expect(isReady(bead({ status: 'deferred' }))).toBe(false)
  })
})

describe('beadMatches due and snoozed filters', () => {
  // Wed, Nov 11 2026
  const now = new Date(2026, 10, 11, 12)
  const at = (day: number) => new Date(2026, 10, day, 9).toISOString()
  const run = (b: Bead, due?: 'week' | 'overdue', snoozed = false): boolean =>
    beadMatches(b, '', [], false, '', due, snoozed, now)

  it('keeps only beads due within the week for due=week', () => {
    expect(run(bead({ due_at: at(14) }), 'week')).toBe(true)
    expect(run(bead({ due_at: at(10) }), 'week')).toBe(false)
    expect(run(bead({ due_at: at(25) }), 'week')).toBe(false)
    expect(run(bead({}), 'week')).toBe(false)
  })

  it('keeps only overdue beads for due=overdue', () => {
    expect(run(bead({ due_at: at(10) }), 'overdue')).toBe(true)
    expect(run(bead({ due_at: at(14) }), 'overdue')).toBe(false)
  })

  it('hides deferred beads unless snoozed is on', () => {
    const deferred = bead({ status: 'deferred', defer_until: at(20) })
    expect(run(deferred)).toBe(false)
    expect(run(deferred, undefined, true)).toBe(true)
    expect(run(bead({ status: 'deferred' }))).toBe(false)
    expect(run(bead({}))).toBe(true)
  })
})
