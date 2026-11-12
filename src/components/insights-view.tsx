import { useQuery } from '@tanstack/react-query'
import { format } from 'date-fns'
import { ArrowDownRight, ArrowUpRight, Minus } from 'lucide-react'
import { useMemo } from 'react'
import type { CSSProperties } from 'react'

import { PriorityBadge } from '@/components/priority-badge'
import { InteractiveRow } from '@/components/ui/interactive-row'
import { ToggleGroup, ToggleGroupItem } from '@/components/ui/toggle-group'
import {
  burnUp,
  cycleByType,
  deltaTone,
  formatDays,
  formatSigned,
  insightsSummary,
  labelStep,
  trend,
  weeklyBuckets,
} from '@/lib/insights'
import type { DeltaTone } from '@/lib/insights'
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

const NUM = 'font-mono tabular-nums'
// Axis text is HTML over the SVG so it renders at the real 11px, not scaled.
const TICK =
  'pointer-events-none absolute whitespace-nowrap font-mono text-badge tabular-nums text-muted-foreground'

const TONE_CLASS: Record<DeltaTone, string> = {
  good: 'text-status-closed',
  bad: 'text-status-blocked',
  flat: 'text-muted-foreground',
}

/** Percent position of a viewBox point, so HTML labels track the scaled chart. */
function at(x: number, y: number, w: number, h: number): CSSProperties {
  return { left: `${(x / w) * 100}%`, top: `${(y / h) * 100}%` }
}

/** One decimal, as the summary shows it. */
function round1(n: number): number {
  return Number(n.toFixed(1))
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

function Change({
  direction,
  tone,
  text,
}: {
  direction: -1 | 0 | 1
  tone: DeltaTone
  text: string
}) {
  return (
    <span
      className={`inline-flex items-center gap-0.5 align-middle font-mono text-xs tabular-nums ${TONE_CLASS[tone]}`}
    >
      <TrendIcon direction={direction} />
      {text}
    </span>
  )
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
  const cycles = useMemo(
    () => cycleByType(beads, now, weeks),
    [beads, now, weeks],
  )

  const staleQuery = useQuery({
    queryKey: ['insights-stale', project],
    queryFn: () => staleBeadsFn({ data: { project, days: STALE_DAYS } }),
    retry: false,
  })
  const stale = (staleQuery.data ?? []).filter((bead) => !isGate(bead))

  const rateNow = round1(summary.perWeek)
  const ratePrev = round1(summary.perWeekPrev)
  const rateDirection = trend(rateNow, ratePrev)

  const cycle = summary.medianDays === null ? null : round1(summary.medianDays)
  const cyclePrev =
    summary.medianDaysPrev === null ? null : round1(summary.medianDaysPrev)
  const cycleDirection =
    cycle === null || cyclePrev === null ? 0 : trend(cycle, cyclePrev)

  const lastBurn = burn.at(-1)
  const maxScope = Math.max(1, ...burn.map((p) => p.scope))
  const yTicks = [...new Set([0, Math.ceil(maxScope / 2), maxScope])]
  const maxBar = Math.max(
    1,
    ...buckets.map((b) => Math.max(b.created, b.closed)),
  )
  const maxCycle = Math.max(1, ...cycles.map((c) => c.days))
  const step = labelStep(weeks)

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
        Closing <span className={NUM}>{rateNow.toFixed(1)}</span> beads a week{' '}
        <Change
          direction={rateDirection}
          tone={deltaTone(rateDirection, true)}
          text={`(${formatSigned(rateNow - ratePrev, 1)})`}
        />
        {' · median cycle time '}
        {cycle === null ? (
          <span className={NUM}>—</span>
        ) : (
          <span className={NUM}>{formatDays(cycle)}</span>
        )}{' '}
        {cycle !== null && cyclePrev !== null ? (
          <Change
            direction={cycleDirection}
            tone={deltaTone(cycleDirection, false)}
            text={`(${formatSigned(cycle - cyclePrev, 1)}d)`}
          />
        ) : null}
        {' · '}
        <span className={NUM}>{summary.openUrgent}</span> open P0–P1,{' '}
        <span className={NUM}>{summary.overdue}</span> overdue
        {' · '}
        <span className={NUM}>
          {staleQuery.isSuccess ? stale.length : '—'}
        </span>{' '}
        stale
      </p>

      <div className="grid gap-6 lg:grid-cols-[1.45fr_1fr]">
        <section className="rounded-lg border border-border p-4">
          <h2 className="text-sm text-foreground">Burn-up</h2>
          {!lastBurn || lastBurn.scope === 0 ? (
            <p className="py-10 text-body text-muted-foreground">
              No work in this range.
            </p>
          ) : (
            <div className="relative mt-3">
              <svg
                viewBox={`0 0 ${BURN_W} ${BURN_H}`}
                className="block w-full"
                role="img"
                aria-label={`Burn-up: ${lastBurn.done} done of ${lastBurn.scope} scope`}
              >
                {yTicks.map((tick) => (
                  <line
                    key={tick}
                    x1={PAD}
                    x2={BURN_W - PAD}
                    y1={burnY(tick)}
                    y2={burnY(tick)}
                    className="stroke-border"
                    strokeWidth={1}
                  />
                ))}
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
              </svg>
              {yTicks.map((tick) => (
                <span
                  key={tick}
                  className={`${TICK} -translate-y-1/2`}
                  style={{ ...at(0, burnY(tick), BURN_W, BURN_H), left: 0 }}
                >
                  {tick}
                </span>
              ))}
              <span
                className={`${TICK} -translate-x-full -translate-y-full text-foreground`}
                style={at(
                  BURN_W - PAD,
                  burnY(lastBurn.done) - 4,
                  BURN_W,
                  BURN_H,
                )}
              >
                {lastBurn.done} done
              </span>
              <span
                className={`${TICK} -translate-x-full -translate-y-full`}
                style={at(
                  BURN_W - PAD,
                  burnY(lastBurn.scope) - 4,
                  BURN_W,
                  BURN_H,
                )}
              >
                {lastBurn.scope} scope
              </span>
              {burn.map((_, i) =>
                (burn.length - 1 - i) % step === 0 && buckets[i] ? (
                  <span
                    key={buckets[i].start.getTime()}
                    className={`${TICK} -translate-x-1/2 -translate-y-full`}
                    style={at(burnX(i), BURN_H - 2, BURN_W, BURN_H)}
                  >
                    {format(buckets[i].start, 'M/d')}
                  </span>
                ) : null,
              )}
            </div>
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
          <div className="relative mt-2">
            <svg
              viewBox={`0 0 ${BAR_W} ${BAR_H}`}
              className="block w-full"
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
                  </g>
                )
              })}
            </svg>
            {buckets.map((bucket, i) =>
              (buckets.length - 1 - i) % step === 0 ? (
                <span
                  key={bucket.start.getTime()}
                  className={`${TICK} -translate-x-1/2 -translate-y-full`}
                  style={at(i * slot + slot / 2, BAR_H - 2, BAR_W, BAR_H)}
                >
                  {format(bucket.start, 'M/d')}
                </span>
              ) : null,
            )}
          </div>
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
              {cycles.map((row) => (
                <li key={row.type} className="flex items-center gap-3">
                  <span className="w-16 shrink-0 text-body text-foreground">
                    {row.type}
                  </span>
                  <div className="h-2 flex-1 rounded-sm bg-muted/60">
                    <div
                      className="h-2 rounded-sm bg-primary-text/70"
                      style={{ width: `${(row.days / maxCycle) * 100}%` }}
                    />
                  </div>
                  <span className="w-12 shrink-0 text-right font-mono text-xs tabular-nums text-foreground">
                    {formatDays(row.days)}
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
