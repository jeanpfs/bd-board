import type { LeaseState } from './lease'
import { describe, expect, it } from 'vitest'

import { agentRows, gateBlocks, leaseState } from './lease'

import type { Bead } from './types'

const NOW = Date.parse('2026-05-20T12:00:00Z')
const at = (ms: number) => new Date(NOW + ms).toISOString()
const MIN = 60_000

function bead(over: Partial<Bead> & { id: string }): Bead {
  return {
    title: over.id,
    status: 'in_progress',
    priority: 2,
    issue_type: 'task',
    updated_at: at(0),
    ...over,
  }
}

/** Narrows out `none`; a test that reaches here expects a lease. */
function timed(state: LeaseState): Exclude<LeaseState, { kind: 'none' }> {
  if (state.kind === 'none') throw new Error('expected a lease')
  return state
}

describe('leaseState', () => {
  it('reports no lease when lease_expires_at is absent', () => {
    expect(leaseState(bead({ id: 'a' }), new Date(NOW))).toEqual({
      kind: 'none',
    })
  })

  it('reports live with remaining time above two minutes', () => {
    const state = leaseState(
      bead({
        id: 'a',
        lease_expires_at: at(18 * MIN),
        heartbeat_at: at(-12_000),
      }),
      new Date(NOW),
    )
    expect(state.kind).toBe('live')
    expect(timed(state).remainingMs).toBe(18 * MIN)
    expect(timed(state).heartbeatAgoMs).toBe(12_000)
  })

  it('treats exactly two minutes left as expiring', () => {
    const state = leaseState(
      bead({ id: 'a', lease_expires_at: at(2 * MIN) }),
      new Date(NOW),
    )
    expect(state.kind).toBe('expiring')
    expect(timed(state).remainingMs).toBe(2 * MIN)
  })

  it('treats just over two minutes left as live', () => {
    const state = leaseState(
      bead({ id: 'a', lease_expires_at: at(2 * MIN + 1) }),
      new Date(NOW),
    )
    expect(state.kind).toBe('live')
  })

  it('reports expired once the lease time has passed', () => {
    const state = leaseState(
      bead({ id: 'a', lease_expires_at: at(-6 * MIN) }),
      new Date(NOW),
    )
    expect(state.kind).toBe('expired')
    expect(timed(state).remainingMs).toBe(-6 * MIN)
  })

  it('treats a lease ending exactly now as expired', () => {
    const state = leaseState(
      bead({ id: 'a', lease_expires_at: at(0) }),
      new Date(NOW),
    )
    expect(state.kind).toBe('expired')
  })

  it('omits heartbeat age when no heartbeat was recorded', () => {
    const state = leaseState(
      bead({ id: 'a', lease_expires_at: at(MIN) }),
      new Date(NOW),
    )
    expect(timed(state).heartbeatAgoMs).toBeUndefined()
  })
})

describe('agentRows', () => {
  it('groups in-progress beads by assignee, ignoring other statuses', () => {
    const rows = agentRows([
      bead({
        id: 'a',
        assignee: 'claude-code',
        lease_expires_at: at(MIN * 10),
      }),
      bead({ id: 'b', assignee: 'claude-code', lease_expires_at: at(MIN * 9) }),
      bead({ id: 'c', assignee: 'codex-ci', lease_expires_at: at(MIN) }),
      bead({ id: 'd', assignee: 'claude-code', status: 'open' }),
    ])
    expect(rows.map((r) => r.agent)).toEqual(['claude-code', 'codex-ci'])
    expect(rows[0].beads.map((b) => b.id)).toEqual(['a', 'b'])
  })

  it('marks an unleased claimed bead as a human row', () => {
    const rows = agentRows([bead({ id: 'x', assignee: 'dev' })])
    expect(rows).toHaveLength(1)
    expect(rows[0]).toMatchObject({ agent: 'dev', human: true })
  })

  it('treats a leased assignee as an agent, not a human', () => {
    const rows = agentRows([
      bead({ id: 'x', assignee: 'codex-ci', lease_expires_at: at(MIN) }),
    ])
    expect(rows[0].human).toBe(false)
  })

  it('treats an assignee as an agent when any of their claims has a lease', () => {
    const rows = agentRows([
      bead({ id: 'x', assignee: 'dev' }),
      bead({ id: 'y', assignee: 'dev', lease_expires_at: at(MIN) }),
    ])
    expect(rows[0].human).toBe(false)
  })

  it('skips in-progress beads with no assignee', () => {
    expect(agentRows([bead({ id: 'x' })])).toEqual([])
  })
})

describe('gateBlocks', () => {
  it('maps each gate to the bead that blocks on it', () => {
    const gate = bead({ id: 'g1', issue_type: 'gate' })
    const blocked = bead({
      id: 'ldg-axk.3',
      links: [{ id: 'g1', type: 'blocks', direction: 'outgoing' }],
    })
    const map = gateBlocks([gate], [blocked])
    expect(map.get('g1')).toBe('ldg-axk.3')
  })

  it('ignores non-gate beads and non-blocks edges', () => {
    const notGate = bead({ id: 'n1', issue_type: 'task' })
    const other = bead({
      id: 'x',
      links: [{ id: 'n1', type: 'parent-child', direction: 'outgoing' }],
    })
    expect(gateBlocks([notGate], [other]).size).toBe(0)
  })

  it('ignores an incoming blocks link: the gate must be what blocks the bead', () => {
    const gate = bead({ id: 'g1', issue_type: 'gate' })
    const blocker = bead({
      id: 'b',
      links: [{ id: 'g1', type: 'blocks', direction: 'incoming' }],
    })
    expect(gateBlocks([gate], [blocker]).size).toBe(0)
  })
})
