import { useQuery } from '@tanstack/react-query'
import { format } from 'date-fns'
import { ArrowDownRight, ArrowUpRight, Minus } from 'lucide-react'
import { useMemo } from 'react'

import { PriorityBadge } from '@/components/priority-badge'
import { InteractiveRow } from '@/components/ui/interactive-row'
import { ToggleGroup, ToggleGroupItem } from '@/components/ui/toggle-group'
import {
  burnUp,
  cycleByType,
  insightsSummary,
  trend,
  weeklyBuckets,
} from '@/lib/insights'
import { isGate } from '@/lib/lease'
import { staleBeadsFn } from '@/lib/server'
import type { Bead } from '@/lib/types'

export type InsightsWeeks = 4 | 8 | 13

const RANGE_OPTIONS: { weeks: InsightsWeeks; label: string }[] = [
  { weeks: 4, label: '4 weeks' },
  { weeks: 8, label: '8 weeks' },
  { weeks: 13, label: 'Quarter' },
]

const STALE_DAYS = 10
const DAY_MS = 24 * 60 * 60 * 1000

const BURN_W = 560
const BURN_H = 190
const BAR_W = 330
const BAR_H = 174
const PAD = 24

function formatDays(days: number): string {
  return days < 10 ? `${days.toFixed(1)}d` : `${Math.round(days)}d`
}

function TrendIcon({ direction }: { direction: -1 | 0 | 1 }) {
  if (direction > 0) {
    return <ArrowUpRight className="size-3.5" aria-label="up" />
  }
  if (direction < 0) {
    return <ArrowDownRight className="size-3.5" aria-label="down" />
  }
  return <Minus className="size-3.5" aria-label="flat" />
}

export function InsightsView({
  project,
  weeks,
  onWeeksChange,
  beads,
  onOpen,
}: {
  project: string
  weeks: InsightsWeeks
  onWeeksChange: (weeks: InsightsWeeks) => void
  beads: Bead[]
  onOpen: (bead: Bead) => void
}) {
  const now = useMemo(() => new Date(), [])
  const summary = useMemo(
    () => insightsSummary(beads, weeks, now),
    [beads, weeks, now],
  )
  const buckets = useMemo(
    () => weeklyBuckets(beads, now, weeks),
    [beads, now, weeks],
  )
  const burn = useMemo(() => burnUp(beads, now, weeks), [beads, now, weeks])
  const cycles = useMemo(() => cycleByType(beads), [beads])

  const staleQuery = useQuery({
    queryKey: ['insights-stale', project],
    queryFn: () => staleBeadsFn({ data: { project, days: STALE_DAYS } }),
    retry: false,
  })
  const stale = (staleQuery.data ?? []).filter((bead) => !isGate(bead))

  const perWeekTrend = trend(summary.perWeek, summary.perWeekPrev)
  const lastBurn = burn.at(-1)
  const maxScope = Math.max(1, ...burn.map((p) => p.scope))
  const maxBar = Math.max(
    1,
    ...buckets.map((b) => Math.max(b.created, b.closed)),
  )
  const maxCycle = Math.max(1, ...cycles.map((c) => c.days))

  const burnX = (i: number) =>
    PAD + (burn.length > 1 ? (i / (burn.length - 1)) * (BURN_W - PAD * 2) : 0)
  const burnY = (value: number) =>
    BURN_H - PAD - (value / maxScope) * (BURN_H - PAD * 2)
  const donePath = burn
    .map((p, i) => `${i === 0 ? 'M' : 'L'}${burnX(i)},${burnY(p.done)}`)
    .join(' ')
  const scopePath = burn
    .map((p, i) => `${i === 0 ? 'M' : 'L'}${burnX(i)},${burnY(p.scope)}`)
    .join(' ')
  const doneArea = burn.length
    ? `${donePath} L${burnX(burn.length - 1)},${BURN_H - PAD} L${burnX(0)},${BURN_H - PAD} Z`
    : ''

  const slot = BAR_W / Math.max(1, buckets.length)
  const barWidth = Math.max(2, slot * 0.36)
  const barY = (value: number) =>
    BAR_H - PAD - (value / maxBar) * (BAR_H - PAD * 2)

  return (
    <div className="flex flex-col gap-6 p-6">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <ToggleGroup
          type="single"
          value={String(weeks)}
          onValueChange={(value) =>
            value && onWeeksChange(Number(value) as InsightsWeeks)
          }
          aria-label="Range"
        >
          {RANGE_OPTIONS.map((option) => (
            <ToggleGroupItem
              key={option.weeks}
              value={String(option.weeks)}
              aria-label={option.label}
            >
              {option.label}
            </ToggleGroupItem>
          ))}
        </ToggleGroup>
        <p className="font-mono text-xs text-muted-foreground">
          From created / started / closed timestamps · bd query · bd stale
        </p>
      </div>

      <p className="text-body text-foreground">
        Closed <span className="font-mono tabular-nums">{summary.perWeek}</span>
        /week over {weeks} weeks{' '}
        <span className="inline-flex items-center gap-1 align-middle">
          <TrendIcon direction={perWeekTrend} />
          <span className="font-mono tabular-nums">{summary.perWeekPrev}</span>
        </span>{' '}
        before · median cycle{' '}
        <span className="font-mono tabular-nums">
          {summary.medianDays === null ? '—' : formatDays(summary.medianDays)}
        </span>{' '}
        · <span className="font-mono tabular-nums">{summary.openUrgent}</span>{' '}
        urgent open ·{' '}
        <span className="font-mono tabular-nums">{summary.overdue}</span>{' '}
        overdue
      </p>

      <div className="grid gap-6 lg:grid-cols-[1.45fr_1fr]">
        <section className="rounded-lg border border-primary-text p-4">
          <h2 className="text-sm text-foreground">Burn-up</h2>
          {!lastBurn || lastBurn.scope === 0 ? (
            <p className="py-10 text-body text-muted-foreground">
              No work in this range.
            </p>
          ) : (
            <svg
              viewBox={`0 0 ${BURN_W} ${BURN_H}`}
              className="mt-3 w-full"
              role="img"
              aria-label={`Burn-up: ${lastBurn.done} done of ${lastBurn.scope} scope`}
            >
              <path d={doneArea} className="fill-status-closed/20" />
              <path
                d={donePath}
                className="fill-none stroke-status-closed"
                strokeWidth={2}
              />
              <path
                d={scopePath}
                className="fill-none stroke-muted-foreground"
                strokeDasharray="4 4"
                strokeWidth={1.5}
              />
              <text
                x={BURN_W - PAD}
                y={burnY(lastBurn.done) - 6}
                textAnchor="end"
                className="fill-foreground font-mono text-badge"
              >
                {lastBurn.done} done
              </text>
              <text
                x={BURN_W - PAD}
                y={burnY(lastBurn.scope) - 6}
                textAnchor="end"
                className="fill-muted-foreground font-mono text-badge"
              >
                {lastBurn.scope} scope
              </text>
            </svg>
          )}
        </section>

        <section>
          <h2 className="text-sm text-foreground">Created vs closed</h2>
          <div className="mt-3 flex items-center gap-4 text-xs text-muted-foreground">
            <span className="inline-flex items-center gap-1.5">
              <span
                className="size-2 rounded-sm bg-muted-foreground"
                aria-hidden="true"
              />
              Created
            </span>
            <span className="inline-flex items-center gap-1.5">
              <span
                className="size-2 rounded-sm bg-status-closed"
                aria-hidden="true"
              />
              Closed
            </span>
          </div>
          <svg
            viewBox={`0 0 ${BAR_W} ${BAR_H}`}
            className="mt-2 w-full"
            role="img"
            aria-label="Created and closed beads per week"
          >
            {buckets.map((bucket, i) => {
              const x = i * slot + slot / 2
              return (
                <g key={bucket.start.getTime()}>
                  <rect
                    x={x - barWidth}
                    y={barY(bucket.created)}
                    width={barWidth}
                    height={BAR_H - PAD - barY(bucket.created)}
                    className="fill-muted-foreground"
                  />
                  <rect
                    x={x}
                    y={barY(bucket.closed)}
                    width={barWidth}
                    height={BAR_H - PAD - barY(bucket.closed)}
                    className="fill-status-closed"
                  />
                  <text
                    x={x}
                    y={BAR_H - 6}
                    textAnchor="middle"
                    className="fill-muted-foreground font-mono text-badge"
                  >
                    {format(bucket.start, 'M/d')}
                  </text>
                </g>
              )
            })}
          </svg>
        </section>
      </div>

      <div className="grid gap-6 lg:grid-cols-2">
        <section>
          <h2 className="text-sm text-foreground">Cycle time by type</h2>
          {cycles.length === 0 ? (
            <p className="py-6 text-body text-muted-foreground">
              No closed work in this range.
            </p>
          ) : (
            <ul className="mt-3 flex flex-col gap-2">
              {cycles.map((cycle) => (
                <li key={cycle.type} className="flex items-center gap-3">
                  <span className="w-16 shrink-0 text-body text-foreground">
                    {cycle.type}
                  </span>
                  <div className="h-2 flex-1 rounded-sm bg-muted/60">
                    <div
                      className="h-2 rounded-sm bg-primary-text/70"
                      style={{ width: `${(cycle.days / maxCycle) * 100}%` }}
                    />
                  </div>
                  <span className="w-12 shrink-0 text-right font-mono text-xs tabular-nums text-foreground">
                    {formatDays(cycle.days)}
                  </span>
                </li>
              ))}
            </ul>
          )}
        </section>

        <section>
          <h2 className="text-sm text-foreground">Stale work</h2>
          <p className="font-mono text-xs text-muted-foreground">
            bd stale --days {STALE_DAYS}
          </p>
          {staleQuery.isError ? (
            <p className="py-6 text-body text-destructive">
              Failed to load stale work.
            </p>
          ) : staleQuery.isPending ? (
            <p className="py-6 text-body text-muted-foreground">Loading…</p>
          ) : stale.length === 0 ? (
            <p className="py-6 text-body text-muted-foreground">
              Nothing stale.
            </p>
          ) : (
            <ul className="mt-3 flex flex-col divide-y divide-border">
              {stale.map((bead) => {
                const age = bead.updated_at
                  ? Math.floor(
                      (now.getTime() - new Date(bead.updated_at).getTime()) /
                        DAY_MS,
                    )
                  : null
                return (
                  <li key={bead.id} className="flex items-center gap-3 py-2">
                    <PriorityBadge priority={bead.priority} />
                    <span className="shrink-0 font-mono text-xs text-muted-foreground">
                      {bead.id}
                    </span>
                    <InteractiveRow
                      variant="plain"
                      size="flush"
                      className="min-w-0 flex-1"
                      onClick={() => onOpen(bead)}
                    >
                      <span className="truncate text-body">{bead.title}</span>
                    </InteractiveRow>
                    {age !== null ? (
                      <span className="shrink-0 font-mono text-xs tabular-nums text-warn">
                        {age}d
                      </span>
                    ) : null}
                  </li>
                )
              })}
            </ul>
          )}
        </section>
      </div>
    </div>
  )
}
