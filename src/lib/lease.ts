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
  /** True when the actor is not an agent: see isAgentActor. */
  human: boolean
  beads: Bead[]
}

/**
 * An actor is an agent when it holds or held a bead with a lease whose
 * heartbeat is later than the claim start. The app's own identity is never an agent.
 */
export function isAgentActor(
  actor: string,
  beads: Bead[],
  identity: string | null,
): boolean {
  if (actor === identity) return false
  return beads.some(
    (b) =>
      b.assignee === actor &&
      b.lease_expires_at !== undefined &&
      b.heartbeat_at !== undefined &&
      b.started_at !== undefined &&
      Date.parse(b.heartbeat_at) > Date.parse(b.started_at),
  )
}

/** In-progress beads grouped by assignee, in first-seen order. */
export function agentRows(beads: Bead[], identity: string | null): AgentRow[] {
  const rows = new Map<string, AgentRow>()
  for (const bead of beads) {
    if (bead.status !== 'in_progress' || !bead.assignee) continue
    let row = rows.get(bead.assignee)
    if (!row) {
      row = {
        agent: bead.assignee,
        human: !isAgentActor(bead.assignee, beads, identity),
        beads: [],
      }
      rows.set(bead.assignee, row)
    }
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
