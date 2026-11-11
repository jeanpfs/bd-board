import { describe, expect, it } from 'vitest'

import {
  dueState,
  isDueThisWeek,
  isOverdue,
  formatEstimate,
  localDateParam,
  parseEstimate,
  quickDue,
} from './schedule'

import type { Bead } from './types'

describe('parseEstimate', () => {
  it.each([
    ['90', 90],
    ['90m', 90],
    ['3h', 180],
    ['1h30m', 90],
    ['1h 30m', 90],
    ['1.5h', 90],
    [' 2H ', 120],
  ])('reads %s as %i minutes', (text, minutes) => {
    expect(parseEstimate(text)).toBe(minutes)
  })

  it.each(['0', '0m', '-5', 'abc', '', '1h-', '90x', '1.5'])(
    'rejects %j',
    (text) => {
      expect(parseEstimate(text)).toBeNull()
    },
  )
})

describe('formatEstimate', () => {
  it('uses the shortest exact unit', () => {
    expect(formatEstimate(45)).toBe('45m')
    expect(formatEstimate(180)).toBe('3h')
    expect(formatEstimate(90)).toBe('1h 30m')
  })
})

describe('localDateParam', () => {
  it('keeps the local calendar day late in the evening', () => {
    expect(localDateParam(new Date(2026, 10, 16, 23, 59))).toBe('2026-11-16')
    expect(localDateParam(new Date(2026, 0, 5, 0, 1))).toBe('2026-01-05')
  })
})

describe('dueState', () => {
  const now = new Date(2026, 10, 11, 12, 0)

  it('marks a bead due yesterday as overdue by whole local days', () => {
    expect(dueState(new Date(2026, 10, 10, 23, 0).toISOString(), now)).toEqual({
      kind: 'overdue',
      label: 'Overdue 1d',
    })
    expect(dueState(new Date(2026, 10, 9, 8, 0).toISOString(), now)).toEqual({
      kind: 'overdue',
      label: 'Overdue 2d',
    })
  })

  it('treats anything earlier today as due today, not overdue', () => {
    expect(dueState(new Date(2026, 10, 11, 0, 30).toISOString(), now)).toEqual({
      kind: 'soon',
      label: 'Today',
    })
  })

  it('names tomorrow, then weekdays, within the next six days', () => {
    expect(dueState(new Date(2026, 10, 12, 9, 0).toISOString(), now)).toEqual({
      kind: 'soon',
      label: 'Tomorrow',
    })
    expect(dueState(new Date(2026, 10, 16, 9, 0).toISOString(), now)).toEqual({
      kind: 'soon',
      label: 'Mon',
    })
    expect(dueState(new Date(2026, 10, 17, 23, 0).toISOString(), now)).toEqual({
      kind: 'soon',
      label: 'Tue',
    })
  })

  it('shows the date from day seven on', () => {
    expect(dueState(new Date(2026, 10, 18, 9, 0).toISOString(), now)).toEqual({
      kind: 'later',
      label: 'Nov 18',
    })
    expect(dueState(new Date(2026, 10, 19, 9, 0).toISOString(), now)).toEqual({
      kind: 'later',
      label: 'Nov 19',
    })
  })
})

describe('quickDue', () => {
  it('offers bd-parsable values in a fixed order', () => {
    const labels = quickDue(new Date(2026, 10, 11, 12)).map((q) => q.label)
    expect(labels).toEqual(['Today', 'Tomorrow', 'Next Monday', 'In 2 weeks'])
    expect(
      quickDue(new Date(2026, 10, 11, 12))
        .map((q) => q.value)
        .slice(1),
    ).toEqual(['tomorrow', 'next monday', '+2w'])
  })

  it('takes Today from the clock it is given, so midnight rolls it over', () => {
    expect(quickDue(new Date(2026, 10, 11, 23, 59))[0]?.value).toBe(
      '2026-11-11',
    )
    expect(quickDue(new Date(2026, 10, 12, 0, 1))[0]?.value).toBe('2026-11-12')
  })

  it('hints weekdays for the next two days and dates after that', () => {
    // Wed, Nov 11 2026
    const hints = quickDue(new Date(2026, 10, 11, 12)).map((q) => q.hint)
    expect(hints).toEqual(['Wed', 'Thu', 'Nov 16', 'Nov 25'])
  })

  it('moves next Monday forward when today is Monday', () => {
    // Mon, Nov 16 2026: the next Monday is Nov 23, not today
    expect(quickDue(new Date(2026, 10, 16, 9))[2]?.hint).toBe('Nov 23')
  })
})

describe('isOverdue and isDueThisWeek', () => {
  // Wed, Nov 11 2026
  const now = new Date(2026, 10, 11, 12)
  const due = (day: number, hour = 9) =>
    new Date(2026, 10, day, hour).toISOString()
  const bead = (over: Partial<Bead>): Bead => ({
    id: 'bd-board-a',
    title: 'Alpha',
    status: 'open',
    priority: 2,
    issue_type: 'task',
    labels: [],
    ...over,
  })

  it('is overdue from the previous calendar day, never earlier today', () => {
    expect(isOverdue(bead({ due_at: due(10, 23) }), now)).toBe(true)
    expect(isOverdue(bead({ due_at: due(11, 0) }), now)).toBe(false)
    expect(isOverdue(bead({ due_at: due(12) }), now)).toBe(false)
  })

  it('ignores beads without a due date and closed beads', () => {
    expect(isOverdue(bead({}), now)).toBe(false)
    expect(isOverdue(bead({ due_at: due(1), status: 'closed' }), now)).toBe(
      false,
    )
    expect(
      isDueThisWeek(bead({ due_at: due(12), status: 'closed' }), now),
    ).toBe(false)
    expect(isDueThisWeek(bead({}), now)).toBe(false)
  })

  it('treats a custom status in the done category as closed', () => {
    const shipped = { status: 'shipped', status_category: 'done' as const }
    expect(isOverdue(bead({ due_at: due(1), ...shipped }), now)).toBe(false)
    expect(isDueThisWeek(bead({ due_at: due(12), ...shipped }), now)).toBe(
      false,
    )
  })

  it('covers today through six days ahead, seven local days, and excludes overdue', () => {
    expect(isDueThisWeek(bead({ due_at: due(11, 0) }), now)).toBe(true)
    expect(isDueThisWeek(bead({ due_at: due(17, 23) }), now)).toBe(true)
    expect(isDueThisWeek(bead({ due_at: due(18) }), now)).toBe(false)
    expect(isDueThisWeek(bead({ due_at: due(10) }), now)).toBe(false)
  })
})
