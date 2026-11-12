import { describe, expect, it } from 'vitest'

import {
  ATTENTION_ORDER,
  STALE_DAYS,
  attentionList,
  closedThisWeek,
  projectHeadline,
} from './attention'

import type { Bead, Project } from './types'

const NOW = Date.parse('2026-05-20T12:00:00Z')
const daysAgo = (n: number) => new Date(NOW - n * 86_400_000).toISOString()

function bead(over: Partial<Bead> & { id: string }): Bead {
  return {
    title: over.id,
    status: 'open',
    priority: 2,
    issue_type: 'task',
    updated_at: daysAgo(0),
    ...over,
  }
}

function project(over: Partial<Project> = {}): Project {
  return {
    id: 'p',
    name: 'p',
    dir: '/p',
    beadsPath: '/p/.beads',
    prefix: 'p',
    external: false,
    missing: false,
    error: null,
    migration: null,
    counts: {
      open: 0,
      in_progress: 0,
      blocked: 0,
      closed: 0,
      deferred: 0,
      total: 0,
    },
    ...over,
  }
}

describe('attentionList', () => {
  it('orders P0 before blocked before stale, and skips closed beads', () => {
    const list = attentionList(
      [
        bead({ id: 'stale', status: 'in_progress', updated_at: daysAgo(9) }),
        bead({ id: 'blocked', status: 'blocked' }),
        bead({ id: 'p0', priority: 0, status: 'in_progress' }),
        bead({ id: 'closed-p0', priority: 0, status: 'closed' }),
        bead({ id: 'fine', status: 'in_progress' }),
      ],
      NOW,
    )
    expect(list.map((a) => [a.bead.id, a.detail])).toEqual([
      ['p0', 'P0 · in progress'],
      ['blocked', 'blocked'],
      ['stale', 'no update for 9 days'],
    ])
  })

  it('places an overdue bead between P0 and blocked, skipping closed ones', () => {
    const dueYesterday = new Date(NOW - 86_400_000).toISOString()
    const list = attentionList(
      [
        bead({ id: 'blocked', status: 'blocked' }),
        bead({ id: 'late', due_at: dueYesterday }),
        bead({ id: 'p0', priority: 0, status: 'in_progress' }),
        bead({ id: 'done', status: 'closed', due_at: dueYesterday }),
      ],
      NOW,
    )
    expect(list.map((a) => [a.bead.id, a.kind, a.detail])).toEqual([
      ['p0', 'p0', 'P0 · in progress'],
      ['late', 'overdue', 'Overdue 1d'],
      ['blocked', 'blocked', 'blocked'],
    ])
  })

  it('counts an in-progress bead as stale from exactly STALE_DAYS', () => {
    const ids = (n: number) =>
      attentionList(
        [bead({ id: 'b', status: 'in_progress', updated_at: daysAgo(n) })],
        NOW,
      ).map((a) => a.kind)
    expect(ids(STALE_DAYS - 0.5)).toEqual([])
    expect(ids(STALE_DAYS)).toEqual(['stale'])
  })

  it('never calls an open bead stale, however old', () => {
    expect(
      attentionList([bead({ id: 'old', updated_at: daysAgo(90) })], NOW),
    ).toEqual([])
  })
})

describe('projectHeadline', () => {
  const counts = {
    open: 3,
    in_progress: 1,
    blocked: 1,
    closed: 0,
    deferred: 0,
    total: 5,
  }

  it('leads with a problem, warning-toned for a pending migration', () => {
    const gate = {
      currentVersion: 49,
      latestVersion: 66,
    } as Project['migration']
    expect(projectHeadline(project({ migration: gate, counts }))).toMatchObject(
      {
        value: null,
        tone: 'warn',
        rank: 0,
      },
    )
    expect(projectHeadline(project({ missing: true }))).toMatchObject({
      label: 'Folder no longer exists',
      tone: 'danger',
    })
  })

  it('prefers open P0s over blocked, and blocked over ready', () => {
    const beads = [bead({ id: 'a', priority: 0 }), bead({ id: 'b' })]
    expect(projectHeadline(project({ counts }), beads)).toMatchObject({
      value: 1,
      label: 'P0 open',
    })
    expect(
      projectHeadline(project({ counts }), [bead({ id: 'b' })]),
    ).toMatchObject({ value: 1, label: 'blocked' })
    expect(
      projectHeadline(project({ counts: { ...counts, blocked: 0 } }), [
        bead({ id: 'b' }),
        bead({ id: 'c' }),
      ]),
    ).toMatchObject({ value: 2, label: 'ready to pick up' })
  })

  it('ranks overdue above blocked and below open P0s', () => {
    const late = bead({
      id: 'late',
      due_at: new Date(NOW - 2 * 86_400_000).toISOString(),
    })
    expect(projectHeadline(project({ counts }), [late], NOW)).toMatchObject({
      value: 1,
      label: 'overdue',
      tone: 'danger',
    })
    expect(
      projectHeadline(
        project({ counts }),
        [late, bead({ id: 'p0', priority: 0 })],
        NOW,
      ),
    ).toMatchObject({ label: 'P0 open' })
  })

  it('falls back to open counts before the bead list loads', () => {
    expect(
      projectHeadline(project({ counts: { ...counts, blocked: 0 } })),
    ).toMatchObject({ value: 3, label: 'open', rank: 5 })
  })
})

describe('closedThisWeek', () => {
  it('counts closures in the last seven days only', () => {
    expect(
      closedThisWeek(
        [
          bead({ id: 'a', status: 'closed', closed_at: daysAgo(2) }),
          bead({ id: 'b', status: 'closed', closed_at: daysAgo(8) }),
          bead({ id: 'c', status: 'open' }),
        ],
        NOW,
      ),
    ).toBe(1)
  })
})

describe('lease and gate attention', () => {
  const MIN = 60_000
  const inAt = (ms: number) => new Date(NOW + ms).toISOString()

  it('flags an in-progress bead whose lease has expired', () => {
    const [item] = attentionList(
      [
        bead({
          id: 'a',
          status: 'in_progress',
          assignee: 'night-crew-2',
          heartbeat_at: inAt(-18 * MIN),
          lease_expires_at: inAt(-6 * MIN),
        }),
      ],
      NOW,
    )
    expect(item).toMatchObject({ kind: 'lease-expired' })
    expect(item.detail).toBe(
      'night-crew-2 stopped responding 18m ago · lease expired 6m ago',
    )
  })

  it('does not flag a bead whose lease is still live', () => {
    expect(
      attentionList(
        [
          bead({
            id: 'a',
            status: 'in_progress',
            lease_expires_at: inAt(18 * MIN),
          }),
        ],
        NOW,
      ),
    ).toEqual([])
  })

  it('flags a blocked bead waiting on an open gate with the gate id', () => {
    const gate = bead({
      id: 'g1',
      issue_type: 'gate',
      status: 'open',
      created_by: 'claude-code',
    })
    const waiting = bead({
      id: 'ldg-axk.3',
      status: 'blocked',
      links: [{ id: 'g1', type: 'blocks', direction: 'outgoing' }],
    })
    const items = attentionList([gate, waiting], NOW)
    expect(items).toHaveLength(1)
    expect(items[0]).toMatchObject({ kind: 'gate', bead: waiting })
    expect(items[0].gateId).toBe('g1')
    expect(items[0].detail).toBe(
      'Opened by claude-code · resolves with bd gate resolve',
    )
  })

  it('does not flag a gate that is already closed', () => {
    const gate = bead({ id: 'g1', issue_type: 'gate', status: 'closed' })
    const waiting = bead({
      id: 'w',
      status: 'blocked',
      links: [{ id: 'g1', type: 'blocks', direction: 'outgoing' }],
    })
    expect(attentionList([gate, waiting], NOW).map((i) => i.kind)).toEqual([
      'blocked',
    ])
  })

  it('ranks overdue, lease-expired, gate, then blocked', () => {
    expect(ATTENTION_ORDER).toEqual([
      'p0',
      'overdue',
      'lease-expired',
      'gate',
      'blocked',
      'stale',
    ])
  })
})
