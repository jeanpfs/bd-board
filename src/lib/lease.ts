import type { Bead } from './types'

/** Gate beads are coordination records; they never appear as board work. */
export function isGate(bead: Bead): boolean {
  return bead.issue_type === 'gate'
}

/** A lease with at most this much time left is shown as expiring. */
export const EXPIRING_WITHIN_MS = 2 * 60_000

export type LeaseState =
  | { kind: 'none' }
  | {
      kind: 'live' | 'expiring' | 'expired'
      remainingMs: number
      heartbeatAgoMs?: number
    }

export function leaseState(bead: Bead, now: Date): LeaseState {
  if (!bead.lease_expires_at) return { kind: 'none' }
  const remainingMs = Date.parse(bead.lease_expires_at) - now.getTime()
  const heartbeatAgoMs = bead.heartbeat_at
    ? now.getTime() - Date.parse(bead.heartbeat_at)
    : undefined
  let kind: 'live' | 'expiring' | 'expired' = 'live'
  if (remainingMs <= 0) kind = 'expired'
  else if (remainingMs <= EXPIRING_WITHIN_MS) kind = 'expiring'
  return { kind, remainingMs, heartbeatAgoMs }
}

export interface AgentRow {
  agent: string
  /** True when none of the assignee's claims carries a lease: a person, not a running agent. */
  human: boolean
  beads: Bead[]
}

/** In-progress beads grouped by assignee, in first-seen order. */
export function agentRows(beads: Bead[]): AgentRow[] {
  const rows = new Map<string, AgentRow>()
  for (const bead of beads) {
    if (bead.status !== 'in_progress' || !bead.assignee) continue
    let row = rows.get(bead.assignee)
    if (!row) {
      row = {
        agent: bead.assignee,
        human: true,
        beads: [],
      }
      rows.set(bead.assignee, row)
    }
    if (bead.lease_expires_at) row.human = false
    row.beads.push(bead)
  }
  return [...rows.values()]
}

/** Maps each gate bead id to the bead that waits on it via a blocks edge. */
export function gateBlocks(gates: Bead[], beads: Bead[]): Map<string, string> {
  const gateIds = new Set(
    gates.filter((g) => g.issue_type === 'gate').map((g) => g.id),
  )
  const map = new Map<string, string>()
  for (const bead of beads) {
    for (const link of bead.links ?? []) {
      if (
        link.type === 'blocks' &&
        link.direction === 'outgoing' &&
        gateIds.has(link.id)
      ) {
        map.set(link.id, bead.id)
      }
    }
  }
  return map
}
