import { describe, expect, it } from 'vitest'

import { groupBeadLinks, isEpic, mapStatus } from './types'

describe('mapStatus', () => {
  it('maps known bd statuses to board columns', () => {
    expect(mapStatus({ status: 'open' })).toEqual({ column: 'open' })
    expect(mapStatus({ status: 'in_progress' })).toEqual({
      column: 'in_progress',
    })
    expect(mapStatus({ status: 'blocked' })).toEqual({ column: 'blocked' })
    expect(mapStatus({ status: 'closed' })).toEqual({ column: 'closed' })
  })

  it('keeps special bd statuses visible as badges', () => {
    expect(mapStatus({ status: 'deferred' })).toEqual({
      column: 'open',
      badge: { label: 'Deferred', tone: 'muted' },
    })
    expect(mapStatus({ status: 'hooked' })).toEqual({
      column: 'in_progress',
      badge: { label: 'Hooked', tone: 'info' },
    })
    expect(mapStatus({ status: 'pinned' })).toEqual({
      column: 'open',
      badge: { label: 'Pinned', tone: 'warning' },
    })
  })

  it('places custom statuses by their bd category and names them', () => {
    expect(mapStatus({ status: 'in_review', status_category: 'wip' })).toEqual({
      column: 'in_progress',
      badge: { label: 'In review', tone: 'info' },
    })
    expect(mapStatus({ status: 'archived', status_category: 'done' })).toEqual({
      column: 'closed',
      badge: { label: 'Archived', tone: 'info' },
    })
    expect(mapStatus({ status: 'icebox', status_category: 'frozen' })).toEqual({
      column: 'open',
      badge: { label: 'Icebox', tone: 'muted' },
    })
  })

  it('still names a custom status whose category is unknown', () => {
    expect(mapStatus({ status: 'triaged' })).toEqual({
      column: 'open',
      badge: { label: 'Triaged', tone: 'muted' },
    })
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

  describe('groupBeadLinks relates-to', () => {
    it('keeps relates-to links in the related group', () => {
      expect(
        groupBeadLinks([
          { id: 'ravo-x', type: 'relates-to', direction: 'outgoing' },
        ]),
      ).toEqual({
        blockedBy: [],
        blocking: [],
        related: [{ id: 'ravo-x', type: 'relates-to', direction: 'outgoing' }],
      })
    })
  })

  it('handles a bead with no links', () => {
    expect(groupBeadLinks()).toEqual({
      blockedBy: [],
      blocking: [],
      related: [],
    })
  })
})
