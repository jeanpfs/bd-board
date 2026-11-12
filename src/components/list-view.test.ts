import { describe, expect, it } from 'vitest'

import { listGroups } from './list-view'
import type { ListFilters, ListGroupBy } from './list-view'

import type { Bead } from '@/lib/types'

const NOW = new Date('2026-05-20T12:00:00Z')

function bead(over: Partial<Bead> & { id: string }): Bead {
  return {
    title: over.id,
    status: 'open',
    priority: 2,
    issue_type: 'task',
    updated_at: NOW.toISOString(),
    ...over,
  }
}

const NO_FILTERS: ListFilters = {
  search: '',
  priorities: [],
  ready: false,
  assignee: '',
  snoozed: false,
}

function group(beads: Bead[], groupBy: ListGroupBy) {
  return listGroups({
    beads,
    filters: NO_FILTERS,
    groupBy,
    sort: 'priority',
    now: NOW,
  })
}

describe('listGroups by epic', () => {
  it('never lists epics as rows and labels groups with the epic title', () => {
    const groups = group(
      [
        bead({ id: 'e1', title: 'Launch', issue_type: 'epic' }),
        bead({ id: 't1', parent: 'e1', status: 'closed' }),
        bead({ id: 't2', parent: 'e1' }),
      ],
      'epic',
    )

    expect(groups).toHaveLength(1)
    expect(groups[0].label).toBe('Launch')
    expect(groups[0].beads.map((b) => b.id).sort()).toEqual(['t1', 't2'])
    expect(groups[0].progress).toEqual({ done: 1, total: 2 })
  })

  it('puts children of no epic into a No epic group first', () => {
    const groups = group(
      [
        bead({ id: 'e1', title: 'Launch', issue_type: 'epic' }),
        bead({ id: 't1', parent: 'e1' }),
        bead({ id: 'loose' }),
      ],
      'epic',
    )

    expect(groups.map((g) => g.label)).toEqual(['No epic', 'Launch'])
    expect(groups[0].beads.map((b) => b.id)).toEqual(['loose'])
    expect(groups[0].progress).toBeUndefined()
  })

  it('drops epics that have no matching rows', () => {
    const groups = group(
      [bead({ id: 'e1', title: 'Empty', issue_type: 'epic' })],
      'epic',
    )

    expect(groups).toEqual([])
  })
})

describe('listGroups by priority and status', () => {
  it('groups by priority without epic progress', () => {
    const groups = group(
      [
        bead({ id: 'a', priority: 0 }),
        bead({ id: 'b', priority: 2 }),
        bead({ id: 'c', priority: 0 }),
      ],
      'priority',
    )

    expect(groups.map((g) => g.beads.map((b) => b.id).sort())).toEqual([
      ['a', 'c'],
      ['b'],
    ])
    expect(groups.every((g) => g.progress === undefined)).toBe(true)
  })

  it('groups by status in board column order', () => {
    const groups = group(
      [
        bead({ id: 'done', status: 'closed' }),
        bead({ id: 'open1' }),
        bead({ id: 'busy', status: 'in_progress' }),
      ],
      'status',
    )

    expect(groups.map((g) => g.beads[0].id)).toEqual(['open1', 'busy', 'done'])
  })
})
