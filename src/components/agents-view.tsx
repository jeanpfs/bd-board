import { useEffect, useState } from 'react'
import { useQuery, useQueryClient } from '@tanstack/react-query'
import { Bot, Hand, RotateCcw, Unplug } from 'lucide-react'
import { toast } from 'sonner'

import { PriorityBadge } from '@/components/priority-badge'
import { Button } from '@/components/ui/button'
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog'
import { InteractiveRow } from '@/components/ui/interactive-row'
import { getStoredIdentity } from '@/lib/identity'
import { gateDetail, leaseExpiredDetail } from '@/lib/attention'
import { agentRows, gateBlocks, leaseState } from '@/lib/lease'
import type { LeaseState } from '@/lib/lease'
import {
  getConfigFn,
  reclaimBeadFn,
  resolveGateFn,
  unclaimBeadFn,
} from '@/lib/server'
import { isReady } from '@/lib/sort'
import { mapStatus } from '@/lib/types'
import type { Bead } from '@/lib/types'
import { cn, initials, toErrorMessage } from '@/lib/utils'

/** Lease TTL set by `bd ready --claim`; scales the lease bar. */
const LEASE_TTL_MS = 5 * 60_000

interface AgentsViewProps {
  project: string
  beads: Bead[]
  onOpen: (id: string) => void
}

/** `45s`, `18m`, `1h 05m`, `2d`. */
function formatSpan(ms: number): string {
  const seconds = Math.max(0, Math.floor(ms / 1000))
  if (seconds < 60) return `${seconds}s`
  const minutes = Math.floor(seconds / 60)
  if (minutes < 60) return `${minutes}m`
  const hours = Math.floor(minutes / 60)
  if (hours < 24) return `${hours}h ${String(minutes % 60).padStart(2, '0')}m`
  return `${Math.floor(hours / 24)}d`
}

function leaseLabel(lease: LeaseState): string {
  if (lease.kind === 'none') return 'no lease'
  if (lease.kind === 'expired') {
    return `expired ${formatSpan(-lease.remainingMs)} ago`
  }
  return `${formatSpan(lease.remainingMs)} left`
}

function leaseBarPercent(lease: LeaseState): number {
  if (lease.kind === 'none') return 0
  if (lease.kind === 'expired') return 100
  return Math.min(100, (lease.remainingMs / LEASE_TTL_MS) * 100)
}

const LEASE_BAR_CLASS = {
  live: 'bg-status-progress',
  expiring: 'bg-warn',
  expired: 'bg-status-blocked',
} as const

function ageSince(value: string | undefined, now: Date): string {
  if (!value) return '—'
  const ms = now.getTime() - Date.parse(value)
  if (Number.isNaN(ms)) return '—'
  return formatSpan(ms)
}

/** The lease countdowns re-render on this cadence, not only on refetch. */
const TICK_MS = 30_000

export function AgentsView({ project, beads, onOpen }: AgentsViewProps) {
  const queryClient = useQueryClient()
  const [now, setNow] = useState(() => new Date())
  useEffect(() => {
    const id = setInterval(() => setNow(new Date()), TICK_MS)
    return () => clearInterval(id)
  }, [])
  const me = getStoredIdentity()
  const [busyId, setBusyId] = useState<string | null>(null)
  const [confirming, setConfirming] = useState<Bead | null>(null)

  const poolQuery = useQuery({
    queryKey: ['config', project, 'claim.pools'],
    queryFn: () => getConfigFn({ data: { project, key: 'claim.pools' } }),
    retry: false,
  })

  const beadsById = new Map(beads.map((bead) => [bead.id, bead]))
  const rows = agentRows(beads, me).flatMap((row) =>
    row.beads.map((bead) => ({
      agent: row.agent,
      human: row.human,
      bead,
      lease: leaseState(bead, now),
    })),
  )
  const expiredRows = rows.filter((row) => row.lease.kind === 'expired')
  const counts = {
    working: rows.length - expiredRows.length,
    expiring: rows.filter((row) => row.lease.kind === 'expiring').length,
    stale: expiredRows.length,
  }

  const gates = beads.filter(
    (bead) => bead.issue_type === 'gate' && mapStatus(bead).column !== 'closed',
  )
  const gatesById = new Map(gates.map((gate) => [gate.id, gate]))
  const gateItems = [...gateBlocks(gates, beads)].flatMap(
    ([gateId, beadId]) => {
      const bead = beadsById.get(beadId)
      const gate = gatesById.get(gateId)
      return bead && gate && mapStatus(bead).column !== 'closed'
        ? [{ gateId, gate, bead }]
        : []
    },
  )
  const readyBeads = beads.filter(isReady)
  const poolSections = (poolQuery.data ?? '')
    .split(',')
    .map((alias) => alias.trim())
    .filter((alias, index, all) => alias && all.indexOf(alias) === index)
    .map((alias) => ({
      alias,
      ready: readyBeads.filter((bead) => bead.assignee === alias),
    }))
  const queued = poolSections.reduce((sum, pool) => sum + pool.ready.length, 0)
  const needsCount = expiredRows.length + gateItems.length

  async function run(
    id: string,
    action: () => Promise<string | undefined>,
    success: string,
    failure: string,
  ) {
    setBusyId(id)
    try {
      const notice = await action()
      if (notice) toast.info(notice)
      else toast.success(success)
    } catch (error) {
      toast.error(toErrorMessage(error, failure))
    } finally {
      setBusyId(null)
      queryClient.invalidateQueries({ queryKey: ['beads', project] })
      queryClient.invalidateQueries({ queryKey: ['projects'] })
    }
  }

  function reclaim(bead: Bead) {
    return run(
      bead.id,
      async () => {
        const { count } = await reclaimBeadFn({
          data: { project, id: bead.id },
        })
        return count === 0
          ? 'Nothing to reclaim: the lease was renewed'
          : undefined
      },
      `Reclaimed ${bead.id}`,
      'Failed to reclaim bead',
    )
  }

  function unclaim(bead: Bead, force: boolean) {
    return run(
      bead.id,
      async () => {
        await unclaimBeadFn({
          data: { project, id: bead.id, force, actor: me ?? undefined },
        })
        return undefined
      },
      `Released ${bead.id}`,
      'Failed to unclaim bead',
    )
  }

  /** Releasing your own claim is direct; anyone else's needs confirmation. */
  function requestUnclaim(bead: Bead) {
    if (me !== null && bead.assignee === me) void unclaim(bead, false)
    else setConfirming(bead)
  }

  function resolveGate(gateId: string) {
    return run(
      gateId,
      async () => {
        await resolveGateFn({ data: { project, id: gateId } })
        return undefined
      },
      `Resolved gate ${gateId}`,
      'Failed to resolve gate',
    )
  }

  return (
    <div className="flex flex-col gap-section p-6">
      <header className="flex flex-col gap-1">
        <h1 className="text-title font-semibold">Agents</h1>
        <p className="text-body text-muted-foreground">
          Claims, heartbeats and leases from{' '}
          <code className="font-mono text-xs text-foreground">
            bd ready --claim
          </code>
          . <span className="font-mono text-foreground">{counts.working}</span>{' '}
          working ·{' '}
          <span className="font-mono text-foreground">{counts.expiring}</span>{' '}
          lease expiring ·{' '}
          <span className="font-mono text-foreground">{counts.stale}</span>{' '}
          stale · <span className="font-mono text-foreground">{queued}</span>{' '}
          queued in pools.
        </p>
      </header>

      {needsCount > 0 ? (
        <section
          aria-labelledby="agents-needs"
          className="rounded-xl bg-card p-2 ring-1 ring-inset ring-border"
        >
          <h2
            id="agents-needs"
            className="flex items-baseline gap-2 px-2 py-1.5 text-body font-semibold"
          >
            Needs you
            <span className="font-mono text-xs font-normal text-faint">
              {needsCount}
            </span>
          </h2>
          {expiredRows.map((row) => (
            <div
              key={row.bead.id}
              className="flex min-h-14 items-center gap-3 border-t border-border px-2 py-2.5"
            >
              <Unplug aria-hidden className="size-4 shrink-0 text-warn" />
              <div className="min-w-0 flex-1">
                <InteractiveRow
                  variant="plain"
                  size="flush"
                  onClick={() => onOpen(row.bead.id)}
                  className="flex items-baseline gap-2"
                >
                  <span className="font-mono text-xs text-muted-foreground">
                    {row.bead.id}
                  </span>
                  <span className="truncate text-body">{row.bead.title}</span>
                </InteractiveRow>
                <p className="text-xs text-muted-foreground">
                  {leaseExpiredDetail(row.bead, now.getTime())}
                </p>
              </div>
              <Button
                variant="outline"
                size="sm"
                disabled={busyId === row.bead.id}
                onClick={() => void reclaim(row.bead)}
              >
                <RotateCcw aria-hidden />
                Reclaim
              </Button>
              <Button
                variant="ghost"
                size="sm"
                disabled={busyId === row.bead.id}
                onClick={() => requestUnclaim(row.bead)}
              >
                Unclaim
              </Button>
            </div>
          ))}
          {gateItems.map(({ gateId, gate, bead }) => (
            <div
              key={gateId}
              className="flex min-h-14 items-center gap-3 border-t border-border px-2 py-2.5"
            >
              <Hand aria-hidden className="size-4 shrink-0 text-warn" />
              <div className="min-w-0 flex-1">
                <InteractiveRow
                  variant="plain"
                  size="flush"
                  onClick={() => onOpen(bead.id)}
                  className="flex items-baseline gap-2"
                >
                  <span className="font-mono text-xs text-muted-foreground">
                    {bead.id}
                  </span>
                  <span className="truncate text-body">{bead.title}</span>
                </InteractiveRow>
                <p className="text-xs text-muted-foreground">
                  {gateDetail(gate)}
                </p>
              </div>
              <Button
                size="sm"
                disabled={busyId === gateId}
                onClick={() => void resolveGate(gateId)}
              >
                Resolve gate
              </Button>
            </div>
          ))}
        </section>
      ) : null}

      <section aria-labelledby="agents-table" className="flex flex-col">
        <h2
          id="agents-table"
          className="flex items-baseline gap-2 pb-2 text-body font-semibold"
        >
          Agents
          <span className="font-mono text-xs font-normal text-faint">
            {rows.length}
          </span>
        </h2>
        {rows.length === 0 ? (
          <p className="border-t border-border py-4 text-body text-muted-foreground">
            No agent holds a bead right now.
          </p>
        ) : (
          <>
            <div className="grid grid-cols-[minmax(0,1.1fr)_minmax(0,1.6fr)_72px_80px_minmax(0,1.3fr)_auto] gap-4 border-t border-border px-2 py-2 text-xs text-muted-foreground">
              <span>Agent</span>
              <span>Bead</span>
              <span>Claimed</span>
              <span>Heartbeat</span>
              <span>Lease</span>
              <span className="sr-only">Action</span>
            </div>
            {rows.map(({ agent, human, bead, lease }) => {
              const heartbeatMs =
                lease.kind === 'none' || lease.heartbeatAgoMs === undefined
                  ? undefined
                  : lease.heartbeatAgoMs
              return (
                <div
                  key={bead.id}
                  className="grid grid-cols-[minmax(0,1.1fr)_minmax(0,1.6fr)_72px_80px_minmax(0,1.3fr)_auto] items-center gap-4 border-t border-border px-2 py-2.5 text-body"
                >
                  <div className="flex min-w-0 items-center gap-2">
                    {human ? (
                      <span
                        aria-hidden
                        className="flex size-5 shrink-0 items-center justify-center rounded-full bg-muted text-badge font-medium"
                      >
                        {initials(agent)}
                      </span>
                    ) : (
                      <span
                        aria-hidden
                        className="flex size-5 shrink-0 items-center justify-center rounded-sm bg-project-1"
                      >
                        <Bot className="size-3" />
                      </span>
                    )}
                    <span className="flex min-w-0 flex-col">
                      <span className="truncate">{agent}</span>
                      {human ? (
                        <span className="truncate text-xs text-muted-foreground">
                          human
                        </span>
                      ) : null}
                    </span>
                  </div>
                  <div className="flex min-w-0 items-center gap-2">
                    <PriorityBadge priority={bead.priority} />
                    <InteractiveRow
                      variant="plain"
                      size="flush"
                      onClick={() => onOpen(bead.id)}
                      className="min-w-0 truncate"
                    >
                      <span className="font-mono text-xs text-muted-foreground">
                        {bead.id}
                      </span>{' '}
                      {bead.title}
                    </InteractiveRow>
                  </div>
                  <span className="font-mono text-xs">
                    {ageSince(bead.started_at, now)}
                  </span>
                  <span
                    className={cn(
                      'font-mono text-xs',
                      heartbeatMs !== undefined &&
                        heartbeatMs > LEASE_TTL_MS &&
                        'text-status-blocked',
                      heartbeatMs !== undefined &&
                        heartbeatMs <= LEASE_TTL_MS &&
                        'text-status-closed',
                    )}
                  >
                    {heartbeatMs === undefined
                      ? '—'
                      : `${formatSpan(heartbeatMs)} ago`}
                  </span>
                  <div className="flex min-w-0 flex-col gap-1">
                    <span
                      className={cn(
                        'font-mono text-xs',
                        lease.kind === 'expired' && 'text-status-blocked',
                        lease.kind === 'expiring' && 'text-warn',
                      )}
                    >
                      {leaseLabel(lease)}
                    </span>
                    {lease.kind === 'none' ? null : (
                      <div className="h-1 overflow-hidden rounded-full bg-muted">
                        <div
                          className={cn('h-full', LEASE_BAR_CLASS[lease.kind])}
                          style={{ width: `${leaseBarPercent(lease)}%` }}
                        />
                      </div>
                    )}
                  </div>
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={() => onOpen(bead.id)}
                  >
                    Open
                  </Button>
                </div>
              )
            })}
          </>
        )}
      </section>

      {poolSections.map(({ alias, ready }) => (
        <section
          key={alias}
          aria-labelledby={`agents-pool-${alias}`}
          className="flex flex-col"
        >
          <h2
            id={`agents-pool-${alias}`}
            className="flex items-baseline gap-2 pb-2 text-body font-semibold"
          >
            Pool {alias}
            <span className="text-xs font-normal text-muted-foreground">
              <span className="font-mono">{ready.length}</span> ready to claim
            </span>
          </h2>
          {ready.length === 0 ? (
            <p className="border-t border-border py-4 text-body text-muted-foreground">
              Nothing is queued in this pool.
            </p>
          ) : (
            ready.map((bead) => (
              <InteractiveRow
                key={bead.id}
                variant="plain"
                size="flush"
                onClick={() => onOpen(bead.id)}
                className="flex min-h-row items-center gap-3 border-t border-border px-2 py-2.5"
              >
                <PriorityBadge priority={bead.priority} />
                <span className="font-mono text-xs text-muted-foreground">
                  {bead.id}
                </span>
                <span className="min-w-0 flex-1 truncate text-body">
                  {bead.title}
                </span>
                <span className="text-xs text-muted-foreground">ready</span>
              </InteractiveRow>
            ))
          )}
        </section>
      ))}

      <Dialog
        open={confirming !== null}
        onOpenChange={(open) => {
          if (!open) setConfirming(null)
        }}
      >
        <DialogContent>
          <DialogHeader>
            <DialogTitle>
              Release {confirming?.id} from{' '}
              {confirming?.assignee ?? 'its agent'}?
            </DialogTitle>
            <DialogDescription>
              This claim belongs to {confirming?.assignee ?? 'another actor'}.
              Releasing it can interrupt work in progress.
            </DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <Button variant="outline" onClick={() => setConfirming(null)}>
              Cancel
            </Button>
            <Button
              variant="destructive"
              onClick={() => {
                const bead = confirming
                setConfirming(null)
                if (bead) void unclaim(bead, true)
              }}
            >
              Release claim
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  )
}
