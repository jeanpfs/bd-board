import { describe, expect, it } from 'vitest'

import { isEpic, mapStatus } from './types'

describe('mapStatus', () => {
  it('maps known bd statuses to board columns', () => {
    expect(mapStatus('open')).toEqual({ column: 'open' })
    expect(mapStatus('in_progress')).toEqual({ column: 'in_progress' })
    expect(mapStatus('blocked')).toEqual({ column: 'blocked' })
    expect(mapStatus('closed')).toEqual({ column: 'closed' })
  })

  it('keeps special bd statuses visible as badges', () => {
    expect(mapStatus('deferred')).toEqual({
      column: 'open',
      badge: { label: 'Deferred', tone: 'muted' },
    })
    expect(mapStatus('hooked')).toEqual({
      column: 'in_progress',
      badge: { label: 'Hooked', tone: 'info' },
    })
    expect(mapStatus('pinned')).toEqual({
      column: 'open',
      badge: { label: 'Pinned', tone: 'warning' },
    })
  })

  it('falls back unknown statuses to open', () => {
    expect(mapStatus('triaged')).toEqual({ column: 'open' })
  })
})

describe('isEpic', () => {
  it('detects epic issue types', () => {
    expect(isEpic({ issue_type: 'epic' })).toBe(true)
    expect(isEpic({ issue_type: 'task' })).toBe(false)
  })
})
