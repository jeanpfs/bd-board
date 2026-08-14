import { describe, expect, it } from 'vitest'

import { groupBeadLinks, isEpic, mapStatus } from './types'

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

describe('groupBeadLinks', () => {
  it('splits blocks edges by direction and keeps the rest as related', () => {
    expect(
      groupBeadLinks([
        { id: 'ravo-nyu', type: 'blocks', direction: 'outgoing' },
        { id: 'ravo-cbf', type: 'blocks', direction: 'incoming' },
        { id: 'ravo-c4d', type: 'discovered-from', direction: 'outgoing' },
      ]),
    ).toEqual({
      blockedBy: ['ravo-nyu'],
      blocking: ['ravo-cbf'],
      related: [
        { id: 'ravo-c4d', type: 'discovered-from', direction: 'outgoing' },
      ],
    })
  })

  it('leaves parent-child edges out, since parent and children already carry them', () => {
    expect(
      groupBeadLinks([
        { id: 'ravo-epic', type: 'parent-child', direction: 'outgoing' },
      ]),
    ).toEqual({ blockedBy: [], blocking: [], related: [] })
  })

  it('handles a bead with no links', () => {
    expect(groupBeadLinks()).toEqual({
      blockedBy: [],
      blocking: [],
      related: [],
    })
  })
})
