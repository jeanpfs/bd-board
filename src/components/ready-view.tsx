import { useMemo } from 'react'
import { format } from 'date-fns'
import { Ban, Clock, Hand, Info, Plus } from 'lucide-react'

import { PriorityBadge } from '@/components/priority-badge'
import { Button } from '@/components/ui/button'
import { InteractiveRow } from '@/components/ui/interactive-row'
import { Kbd } from '@/components/ui/kbd'
import { splitNotReady, unblockedLabel } from '@/lib/ready'
import { cn } from '@/lib/utils'

import type { Bead, ReadyExplain, ReadyRow } from '@/lib/types'

interface ReadyViewProps {
  data: ReadyExplain
  beadsById: Map<string, Bead>
  beads: Bead[]
  claimingId: string | null
  onClaim: (id: string) => void
  onOpen: (bead: Bead) => void
  onCreate: () => void
}

function snoozedUntil(value: string): string {
  const date = new Date(value)
  return Number.isNaN(date.getTime())
    ? 'Snoozed'
    : `Snoozed until ${format(date, 'EEE, MMM d')}`
}

export function ReadyView({
  data,
  beadsById,
  beads,
  claimingId,
  onClaim,
  onOpen,
  onCreate,
}: ReadyViewProps) {
  const notReady = useMemo(
    () => splitNotReady(data.blocked, beads),
    [data.blocked, beads],
  )
  const now = new Date()

  return (
    <div className="flex min-h-0 flex-1 flex-col gap-section overflow-y-auto pb-page">
      <header className="flex flex-wrap items-center justify-between gap-4">
        <p className="text-body text-muted-foreground">
          Beads you can start now: unblocked, unclaimed, not snoozed. Gates,
          snooze and <span className="font-mono">waits-for</span> are respected.
        </p>
        <div className="flex items-center gap-3">
          <span className="font-mono text-xs text-muted-foreground">
            bd ready --explain
          </span>
          <Button size="sm" onClick={onCreate}>
            <Plus aria-hidden="true" />
            New bead
          </Button>
        </div>
      </header>

      <div className="grid gap-x-12 gap-y-section lg:grid-cols-2">
        <section className="flex min-w-0 flex-col">
          <h2 className="flex items-baseline gap-2 pb-1 text-body font-semibold">
            Ready now
            <span className="font-mono text-xs font-normal text-muted-foreground tabular-nums">
              {data.ready.length}
            </span>
          </h2>
          {data.ready.length === 0 ? (
            <p className="border-t border-border py-3 text-body text-muted-foreground">
              Nothing is ready: every open bead waits on another.
            </p>
          ) : (
            <ul className="flex flex-col">
              {data.ready.map((bead, index) => (
                <ReadyItem
                  key={bead.id}
                  bead={bead}
                  label={unblockedLabel(bead.resolved_blockers, beadsById, now)}
                  claiming={claimingId === bead.id}
                  showShortcut={index === 0}
                  onClaim={onClaim}
                  onOpen={onOpen}
                />
              ))}
            </ul>
          )}
        </section>

        <section className="flex min-w-0 flex-col">
          <h2 className="flex items-baseline gap-2 pb-1 text-body font-semibold">
            Not ready
            <span className="font-mono text-xs font-normal text-muted-foreground tabular-nums">
              {notReady.length}
            </span>
          </h2>
          {notReady.length === 0 ? (
            <p className="border-t border-border py-3 text-body text-muted-foreground">
              Nothing is waiting: every open bead can be started.
            </p>
          ) : (
            <ul className="flex flex-col">
              {notReady.map((row) =>
                row.kind === 'blocked' ? (
                  <li
                    key={row.bead.id}
                    className="flex gap-2.5 border-t border-border py-2.5"
                  >
                    <PriorityBadge priority={row.bead.priority} />
                    <div className="flex min-w-0 flex-1 flex-col gap-1">
                      <span className="text-foreground">
                        <span className="mr-1.5 font-mono text-xs text-muted-foreground">
                          {row.bead.id}
                        </span>
                        {row.bead.title}
                      </span>
                      <span className="flex items-center gap-1.5 text-xs text-status-blocked">
                        <Ban aria-hidden="true" className="size-3.5 shrink-0" />
                        Blocked by{' '}
                        {row.bead.blocked_by
                          .map(
                            (b) =>
                              `${b.id} ${b.title} · ${b.status.replaceAll('_', ' ')}`,
                          )
                          .join(', ')}
                      </span>
                    </div>
                  </li>
                ) : (
                  <li
                    key={row.bead.id}
                    className="flex gap-2.5 border-t border-border py-2.5"
                  >
                    <PriorityBadge priority={row.bead.priority} />
                    <div className="flex min-w-0 flex-1 flex-col gap-1">
                      <span className="text-foreground">
                        <span className="mr-1.5 font-mono text-xs text-muted-foreground">
                          {row.bead.id}
                        </span>
                        {row.bead.title}
                      </span>
                      <span className="flex items-center gap-1.5 text-xs text-muted-foreground">
                        <Clock
                          aria-hidden="true"
                          className="size-3.5 shrink-0"
                        />
                        {row.bead.defer_until
                          ? snoozedUntil(row.bead.defer_until)
                          : 'Snoozed'}
                      </span>
                    </div>
                  </li>
                ),
              )}
            </ul>
          )}
        </section>
      </div>

      <p className="flex items-start gap-2 text-xs text-muted-foreground">
        <Info aria-hidden="true" className="mt-0.5 size-3.5 shrink-0" />
        <span>
          Claim assigns you and moves the bead to In progress in one step (
          <span className="font-mono">bd update --claim</span>), so two people
          or agents never pick the same bead.
        </span>
      </p>
    </div>
  )
}

function ReadyItem({
  bead,
  label,
  claiming,
  showShortcut,
  onClaim,
  onOpen,
}: {
  bead: ReadyRow
  label: string
  claiming: boolean
  showShortcut: boolean
  onClaim: (id: string) => void
  onOpen: (bead: Bead) => void
}) {
  return (
    <li
      data-ready-id={bead.id}
      data-bead-id={bead.id}
      className={cn(
        'flex items-center gap-2.5 border-t border-border py-2 outline-none focus-visible:ring-2 focus-visible:ring-ring/60',
      )}
    >
      <PriorityBadge priority={bead.priority} />
      <InteractiveRow
        variant="plain"
        size="flush"
        onClick={() => onOpen(bead)}
        className="flex min-w-0 flex-1 flex-col gap-1"
      >
        <span className="truncate text-foreground">
          <span className="mr-1.5 font-mono text-xs text-muted-foreground">
            {bead.id}
          </span>
          {bead.title}
        </span>
        {bead.labels && bead.labels.length > 0 ? (
          <span className="text-xs text-muted-foreground">
            {bead.labels.join(', ')}
          </span>
        ) : null}
      </InteractiveRow>
      <span className="shrink-0 text-xs whitespace-nowrap text-muted-foreground">
        {label}
      </span>
      <Button
        size="sm"
        variant="outline"
        disabled={claiming}
        onClick={() => onClaim(bead.id)}
        aria-label={`Claim ${bead.id}`}
      >
        <Hand aria-hidden="true" />
        Claim
        {showShortcut ? <Kbd className="ml-1">C</Kbd> : null}
      </Button>
    </li>
  )
}
