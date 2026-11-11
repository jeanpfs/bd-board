import { describe, expect, it } from 'vitest'

import {
  dueState,
  formatEstimate,
  localDateParam,
  parseEstimate,
  QUICK_DUE,
} from './schedule'

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

  it('names tomorrow, then weekdays, within seven days', () => {
    expect(dueState(new Date(2026, 10, 12, 9, 0).toISOString(), now)).toEqual({
      kind: 'soon',
      label: 'Tomorrow',
    })
    expect(dueState(new Date(2026, 10, 16, 9, 0).toISOString(), now)).toEqual({
      kind: 'soon',
      label: 'Mon',
    })
    expect(dueState(new Date(2026, 10, 18, 23, 0).toISOString(), now)).toEqual({
      kind: 'soon',
      label: 'Wed',
    })
  })

  it('shows the date once it is more than seven days away', () => {
    expect(dueState(new Date(2026, 10, 19, 9, 0).toISOString(), now)).toEqual({
      kind: 'later',
      label: 'Nov 19',
    })
  })
})

describe('QUICK_DUE', () => {
  it('offers bd-parsable values in a fixed order', () => {
    expect(QUICK_DUE.map((q) => q.label)).toEqual([
      'Today',
      'Tomorrow',
      'Next Monday',
      'In 2 weeks',
    ])
    expect(QUICK_DUE.map((q) => q.value).slice(1)).toEqual([
      'tomorrow',
      'next monday',
      '+2w',
    ])
    expect(QUICK_DUE[0]?.value).toMatch(/^\d{4}-\d{2}-\d{2}$/)
  })
})
