import { describe, expect, it } from 'vitest'

import {
  claimErrorMessage,
  parseReadyExplain,
  splitNotReady,
  unblockedLabel,
} from './ready'

import type { Bead } from './types'

const SAMPLE = {
  blocked: [
    {
      blocked_by: [
        { id: 'demo-sqi', priority: 2, status: 'open', title: 'Gate: human' },
      ],
      blocked_by_count: 1,
      created_at: '2026-11-01T10:00:00Z',
      id: 'demo-20j',
      issue_type: 'task',
      priority: 2,
      status: 'open',
      title: 'Gated',
    },
  ],
  ready: [
    {
      created_at: '2026-11-01T10:00:00Z',
      dependency_count: 0,
      id: 'demo-43u',
      issue_type: 'bug',
      labels: ['ui'],
      priority: 0,
      reason: 'no blocking dependencies',
      resolved_blockers: null,
      status: 'open',
      title: 'Bug one',
    },
    {
      id: 'demo-nap',
      issue_type: 'task',
      priority: 1,
      reason: '1 blocker(s) resolved',
      resolved_blockers: ['demo-aaa'],
      status: 'open',
      title: 'Was blocked',
    },
  ],
  schema_version: 1,
  summary: { cycle_count: 0, total_blocked: 1, total_ready: 2 },
}

describe('parseReadyExplain', () => {
  it('maps ready rows with reason and resolved blockers', () => {
    const { ready } = parseReadyExplain(SAMPLE)
    expect(ready.map((r) => r.id)).toEqual(['demo-43u', 'demo-nap'])
    expect(ready[0]).toMatchObject({
      priority: 0,
      labels: ['ui'],
      reason: 'no blocking dependencies',
      resolved_blockers: [],
    })
    expect(ready[1]?.resolved_blockers).toEqual(['demo-aaa'])
  })

  it('keeps gate blockers with their title', () => {
    const { blocked } = parseReadyExplain(SAMPLE)
    expect(blocked[0]?.blocked_by).toEqual([
      { id: 'demo-sqi', priority: 2, status: 'open', title: 'Gate: human' },
    ])
  })

  it('tolerates missing arrays and non-objects', () => {
    expect(parseReadyExplain({})).toEqual({ ready: [], blocked: [] })
    expect(parseReadyExplain(null)).toEqual({ ready: [], blocked: [] })
    expect(
      parseReadyExplain({ ready: [1, 'x', { title: 'no id' }] }).ready,
    ).toEqual([])
  })
})

const bead = (over: Partial<Bead>): Bead => ({
  id: 'x-1',
  title: 'T',
  status: 'open',
  priority: 2,
  issue_type: 'task',
  ...over,
})

describe('splitNotReady', () => {
  it('merges blocked rows and snoozed beads, dropping the closed ones', () => {
    const { blocked } = parseReadyExplain(SAMPLE)
    const beads = [
      bead({
        id: 'a-1',
        status: 'deferred',
        defer_until: '2026-12-01T09:00:00Z',
      }),
      bead({ id: 'a-2', status: 'deferred' }),
      bead({ id: 'a-3', status: 'closed' }),
      bead({ id: 'demo-20j', status: 'open' }),
    ]
    const rows = splitNotReady(blocked, beads)
    expect(rows.map((r) => [r.kind, r.bead.id])).toEqual([
      ['blocked', 'demo-20j'],
      ['snoozed', 'a-1'],
      ['snoozed', 'a-2'],
    ])
  })
})

describe('unblockedLabel', () => {
  const now = new Date('2026-11-11T12:00:00Z')
  const byId = new Map([
    ['b-1', bead({ id: 'b-1', closed_at: '2026-11-11T10:00:00Z' })],
    ['b-2', bead({ id: 'b-2', closed_at: '2026-11-11T11:00:00Z' })],
    ['b-3', bead({ id: 'b-3' })],
  ])
  it('uses the latest blocker close', () => {
    expect(unblockedLabel(['b-1', 'b-2'], byId, now)).toBe(
      'unblocked about 1 hour ago',
    )
  })
  it('falls back to no blockers when none is known', () => {
    expect(unblockedLabel([], byId, now)).toBe('no blockers')
    expect(unblockedLabel(['b-3', 'zzz'], byId, now)).toBe('no blockers')
  })
})

describe('claimErrorMessage', () => {
  it('extracts the holder from bd stderr', () => {
    expect(
      claimErrorMessage(
        'Error updating demo-fiv: issue already claimed by claude-code',
      ),
    ).toBe('Already claimed by claude-code')
  })
  it('returns null for other failures', () => {
    expect(claimErrorMessage('Error: no beads directory')).toBeNull()
    expect(claimErrorMessage('')).toBeNull()
  })
})
