import { useRef, useState } from 'react'
import { useMutation, useQueryClient } from '@tanstack/react-query'
import { addDays, differenceInCalendarDays, format, startOfDay } from 'date-fns'
import {
  CalendarDays,
  ChevronDown,
  ChevronRight,
  Layers,
  TriangleAlert,
} from 'lucide-react'
import { toast } from 'sonner'

import { Button } from '@/components/ui/button'
import { InteractiveRow } from '@/components/ui/interactive-row'
import { Toggle } from '@/components/ui/toggle'
import { ToggleGroup, ToggleGroupItem } from '@/components/ui/toggle-group'
import { localDateParam } from '@/lib/schedule'
import { updateBeadFn } from '@/lib/server'
import { beadPatchFromUpdate, patchCachedBead } from '@/lib/optimistic'
import { childDueLabel, epicSpans, scaleTicks } from '@/lib/timeline'
import { cn, toErrorMessage } from '@/lib/utils'

import type { EpicSpan, TickUnit, TimelineChild } from '@/lib/timeline'
import type { Bead } from '@/lib/types'
import type { KeyboardEvent, PointerEvent } from 'react'

interface TimelineViewProps {
  project: string
  beads: Bead[]
  now: Date
  onOpen: (bead: Bead) => void
}

/** Padding around the data and the minimum visible span, per scale, in days. */
const SCALE: Record<TickUnit, { pad: number; min: number }> = {
  week: { pad: 7, min: 28 },
  month: { pad: 14, min: 120 },
  quarter: { pad: 30, min: 365 },
}

const UNIT_LABEL: Record<TickUnit, string> = {
  week: 'Weeks',
  month: 'Months',
  quarter: 'Quarter',
}

/** Shared grid so the header, epic rows and child rows line up. */
const ROW_GRID = 'grid grid-cols-[17rem_minmax(0,1fr)]'

const DAY_MS = 24 * 60 * 60 * 1000

/** A due-date change being made by drag or keyboard, before it is saved. */
interface DueDraft {
  id: string
  /** The saved due date (or today for an epic with none) the change starts from. */
  base: Date
  date: Date
  /** Pointer x at drag start; unused for keyboard changes. */
  startX: number
  /** Pointer driving a drag; null for keyboard changes. */
  pointerId: number | null
}

function timelineRange(
  spans: EpicSpan[],
  now: Date,
  unit: TickUnit,
): { start: Date; end: Date } {
  const times = [now.getTime()]
  for (const span of spans) {
    if (span.start) times.push(span.start.getTime())
    if (span.due) times.push(span.due.getTime())
    for (const child of span.children) {
      if (child.due) times.push(child.due.getTime())
    }
  }
  const { pad, min } = SCALE[unit]
  const start = addDays(startOfDay(new Date(Math.min(...times))), -pad)
  let end = addDays(startOfDay(new Date(Math.max(...times))), pad)
  if (differenceInCalendarDays(end, start) < min) end = addDays(start, min)
  return { start, end }
}

export function TimelineView({
  project,
  beads,
  now,
  onOpen,
}: TimelineViewProps) {
  const queryClient = useQueryClient()
  const [unit, setUnit] = useState<TickUnit>('week')
  const [epicsOnly, setEpicsOnly] = useState(false)
  const [collapsed, setCollapsed] = useState<Set<string>>(() => new Set())
  const [draft, setDraft] = useState<DueDraft | null>(null)
  const trackRef = useRef<HTMLDivElement>(null)

  const spans = epicSpans(beads, now)
  const { start, end } = timelineRange(spans, now, unit)
  const totalMs = end.getTime() - start.getTime()
  const pct = (d: Date) => ((d.getTime() - start.getTime()) / totalMs) * 100
  const ticks = scaleTicks({ start, end }, unit)

  const save = useMutation({
    mutationFn: ({ id, date }: { id: string; date: Date }) =>
      updateBeadFn({
        data: { project, id, update: { due: localDateParam(date) } },
      }),
    onMutate: ({ id, date }) =>
      patchCachedBead(
        queryClient,
        project,
        id,
        beadPatchFromUpdate({ due: localDateParam(date) }),
      ),
    onError: (error, _vars, undo) => {
      undo?.()
      toast.error(toErrorMessage(error, 'Failed to move due date'))
    },
    onSettled: () => {
      queryClient.invalidateQueries({ queryKey: ['beads', project] })
    },
  })

  /** The due date to draw: the in-flight drag, then the save in flight, then the saved value. */
  function shownDue(span: EpicSpan): Date | undefined {
    if (draft?.id === span.epic.id) return draft.date
    if (save.isPending && save.variables.id === span.epic.id) {
      return save.variables.date
    }
    return span.due
  }

  function commit(current: DueDraft) {
    setDraft(null)
    if (differenceInCalendarDays(current.date, current.base) !== 0) {
      save.mutate({ id: current.id, date: current.date })
    }
  }

  function onHandleDown(e: PointerEvent<HTMLDivElement>, span: EpicSpan) {
    e.currentTarget.setPointerCapture(e.pointerId)
    const base = span.due ?? now
    setDraft({
      id: span.epic.id,
      base,
      date: base,
      startX: e.clientX,
      pointerId: e.pointerId,
    })
  }

  // Only the pointer that started a drag may move or end it, so hovering a
  // handle never changes a pending keyboard edit.
  function onHandleMove(e: PointerEvent<HTMLDivElement>) {
    const track = trackRef.current
    if (!draft || draft.pointerId !== e.pointerId || !track) return
    const width = track.getBoundingClientRect().width
    if (width === 0) return
    const days = Math.round(
      ((e.clientX - draft.startX) / width) * (totalMs / DAY_MS),
    )
    setDraft({ ...draft, date: addDays(draft.base, days) })
  }

  function onHandleUp(e: PointerEvent<HTMLDivElement>) {
    if (!draft || draft.pointerId !== e.pointerId) return
    if (e.type === 'pointercancel') setDraft(null)
    else commit(draft)
  }

  /** Leaving a handle drops a pending keyboard edit; it was never saved. */
  function onHandleBlur(span: EpicSpan) {
    if (draft?.id === span.epic.id) setDraft(null)
  }

  function onHandleKey(e: KeyboardEvent<HTMLDivElement>, span: EpicSpan) {
    if (e.key === 'ArrowLeft' || e.key === 'ArrowRight') {
      e.preventDefault()
      const days = e.key === 'ArrowRight' ? 1 : -1
      const current: DueDraft =
        draft?.id === span.epic.id
          ? draft
          : {
              id: span.epic.id,
              base: span.due ?? now,
              date: shownDue(span) ?? now,
              startX: 0,
              pointerId: null,
            }
      setDraft({ ...current, date: addDays(current.date, days) })
    } else if (e.key === 'Enter' && draft?.id === span.epic.id) {
      e.preventDefault()
      commit(draft)
    } else if (e.key === 'Escape' && draft?.id === span.epic.id) {
      e.preventDefault()
      setDraft(null)
    }
  }

  function toggleCollapsed(id: string) {
    setCollapsed((prev) => {
      const next = new Set(prev)
      if (next.has(id)) next.delete(id)
      else next.add(id)
      return next
    })
  }

  return (
    <div className="flex min-h-0 flex-1 flex-col gap-3 pt-2">
      <div className="flex flex-wrap items-center gap-3">
        <ToggleGroup
          type="single"
          value={unit}
          onValueChange={(value) => value && setUnit(value as TickUnit)}
          aria-label="Time scale"
        >
          {(Object.keys(UNIT_LABEL) as TickUnit[]).map((key) => (
            <ToggleGroupItem key={key} value={key} aria-label={UNIT_LABEL[key]}>
              {UNIT_LABEL[key]}
            </ToggleGroupItem>
          ))}
        </ToggleGroup>
        <Toggle
          pressed={epicsOnly}
          onPressedChange={setEpicsOnly}
          className="gap-1.5"
        >
          <Layers className="size-3.5" aria-hidden="true" />
          Epics only
        </Toggle>
        <p className="ml-auto text-xs text-muted-foreground">
          Bars use started_at → due; fill = closed children
        </p>
      </div>

      {spans.length === 0 ? (
        <p className="py-8 text-center text-sm text-muted-foreground">
          No open epics to plan. Create an epic to see it here.
        </p>
      ) : (
        <div className="relative min-h-0 flex-1 overflow-y-auto">
          <div
            aria-hidden="true"
            className="pointer-events-none absolute inset-y-0 left-[17rem] right-0"
          >
            {ticks.map((tick) => (
              <div
                key={tick.getTime()}
                className="absolute inset-y-0 w-px bg-border/60"
                style={{ left: `${pct(tick)}%` }}
              />
            ))}
            <div
              className="absolute inset-y-0 w-px bg-primary-text"
              style={{ left: `${pct(now)}%` }}
            />
          </div>

          <div
            className={cn(
              ROW_GRID,
              'border-b border-border text-badge text-muted-foreground',
            )}
          >
            <div className="px-2 py-1.5">Epic / bead</div>
            <div className="relative h-9" ref={trackRef}>
              {ticks.map((tick) => (
                <span
                  key={tick.getTime()}
                  className="absolute top-4 font-mono tabular-nums"
                  style={{ left: `${pct(tick)}%` }}
                >
                  {format(tick, 'MMM d')}
                </span>
              ))}
              <span
                className="absolute top-0 font-mono text-primary-text"
                style={{ left: `${pct(now)}%` }}
              >
                today · {format(now, 'MMM d')}
              </span>
            </div>
          </div>

          {spans.map((span) => {
            const isCollapsed = collapsed.has(span.epic.id)
            const due = shownDue(span)
            const handleAt = due ?? now
            const fill = span.total > 0 ? span.done / span.total : 0
            const notStarted = !span.start
            const labelStyle =
              pct(handleAt) > 70
                ? { right: `calc(${100 - pct(handleAt)}% + 0.75rem)` }
                : { left: `calc(${pct(handleAt)}% + 0.75rem)` }
            return (
              <div key={span.epic.id}>
                <div className={cn(ROW_GRID, 'border-b border-border')}>
                  <div className="flex min-w-0 items-center gap-1 py-1.5 pr-2 pl-1">
                    {span.children.length > 0 ? (
                      <Button
                        variant="ghost"
                        size="icon-xs"
                        aria-label={
                          isCollapsed
                            ? `Expand ${span.epic.id}`
                            : `Collapse ${span.epic.id}`
                        }
                        onClick={() => toggleCollapsed(span.epic.id)}
                      >
                        {isCollapsed ? <ChevronRight /> : <ChevronDown />}
                      </Button>
                    ) : (
                      <span className="size-6 shrink-0" aria-hidden="true" />
                    )}
                    <InteractiveRow
                      variant="plain"
                      size="flush"
                      className="flex min-w-0 items-center gap-2"
                      onClick={() => onOpen(span.epic)}
                    >
                      <span className="shrink-0 font-mono text-badge text-muted-foreground">
                        {span.epic.id}
                      </span>
                      <span className="truncate text-body font-medium">
                        {span.epic.title}
                      </span>
                    </InteractiveRow>
                  </div>

                  <div className="relative h-11">
                    {due ? (
                      <div
                        className={cn(
                          'absolute top-1/2 h-2.5 -translate-y-1/2 overflow-hidden rounded-full',
                          notStarted
                            ? 'border border-dashed border-border'
                            : 'bg-muted',
                        )}
                        style={{
                          left: `${pct(span.start ?? now)}%`,
                          width: `${Math.max(pct(due) - pct(span.start ?? now), 0.5)}%`,
                        }}
                      >
                        {notStarted ? null : (
                          <div
                            className="h-full bg-status-progress"
                            style={{ width: `${fill * 100}%` }}
                          />
                        )}
                      </div>
                    ) : null}

                    <div
                      role="slider"
                      tabIndex={0}
                      aria-label={`Due date of ${span.epic.id}`}
                      aria-valuetext={
                        due ? format(due, 'MMM d') : 'No due date'
                      }
                      aria-valuenow={differenceInCalendarDays(handleAt, now)}
                      aria-valuemin={differenceInCalendarDays(start, now)}
                      aria-valuemax={differenceInCalendarDays(end, now)}
                      className="absolute top-1/2 h-5 w-2 -translate-x-1/2 -translate-y-1/2 cursor-ew-resize touch-none rounded bg-foreground outline-none focus-visible:ring-2 focus-visible:ring-ring/60"
                      style={{ left: `${pct(handleAt)}%` }}
                      onPointerDown={(e) => onHandleDown(e, span)}
                      onPointerMove={onHandleMove}
                      onPointerUp={onHandleUp}
                      onPointerCancel={onHandleUp}
                      onKeyDown={(e) => onHandleKey(e, span)}
                      onBlur={() => onHandleBlur(span)}
                    />

                    <div
                      className="absolute top-1/2 flex -translate-y-1/2 items-center gap-2 whitespace-nowrap text-xs"
                      style={labelStyle}
                    >
                      {span.atRisk ? (
                        <span className="flex items-center gap-1 font-medium text-warn">
                          <TriangleAlert
                            className="size-3.5"
                            aria-hidden="true"
                          />
                          At risk
                        </span>
                      ) : null}
                      {due ? (
                        <span className="font-mono tabular-nums text-muted-foreground">
                          {span.done}/{span.total}
                          {notStarted ? ' · not started' : ''} · due{' '}
                          {format(due, 'MMM d')}
                        </span>
                      ) : (
                        <span className="flex items-center gap-1 text-muted-foreground">
                          <CalendarDays
                            className="size-3.5"
                            aria-hidden="true"
                          />
                          No due date · drag to schedule
                        </span>
                      )}
                    </div>
                  </div>
                </div>

                {isCollapsed || epicsOnly
                  ? null
                  : span.children.map((child) => (
                      <ChildRow
                        key={child.bead.id}
                        child={child}
                        now={now}
                        pct={pct}
                        onOpen={onOpen}
                      />
                    ))}
              </div>
            )
          })}
        </div>
      )}

      <footer className="flex flex-wrap items-center gap-4 text-xs text-muted-foreground">
        <span className="flex items-center gap-1.5">
          <span className="size-2 rotate-45 bg-warn" aria-hidden="true" />
          child due in ≤ 7 days
        </span>
        <span className="flex items-center gap-1.5">
          <span
            className="size-2 rotate-45 bg-muted-foreground"
            aria-hidden="true"
          />
          child due later
        </span>
        <span className="flex items-center gap-1.5">
          <span
            className="h-2 w-6 rounded-full border border-dashed border-border"
            aria-hidden="true"
          />
          not started
        </span>
      </footer>
    </div>
  )
}

function ChildRow({
  child,
  now,
  pct,
  onOpen,
}: {
  child: TimelineChild
  now: Date
  pct: (d: Date) => number
  onOpen: (bead: Bead) => void
}) {
  const label = child.due ? childDueLabel(child.due, now) : null
  return (
    <div className={cn(ROW_GRID, 'border-b border-border/60 text-body')}>
      <div className="min-w-0 py-1.5 pr-2 pl-10">
        <InteractiveRow
          variant="plain"
          size="flush"
          className="flex min-w-0 items-center gap-2"
          onClick={() => onOpen(child.bead)}
        >
          <span className="shrink-0 font-mono text-badge text-muted-foreground">
            {child.bead.id}
          </span>
          <span className="truncate">{child.bead.title}</span>
        </InteractiveRow>
      </div>
      <div className="relative h-9">
        {child.due && label ? (
          <>
            <span
              aria-hidden="true"
              className={cn(
                'absolute top-1/2 size-2.5 -translate-x-1/2 -translate-y-1/2 rotate-45',
                label.soon ? 'bg-warn' : 'bg-muted-foreground',
              )}
              style={{ left: `${pct(child.due)}%` }}
            />
            <span
              className={cn(
                'absolute top-1/2 -translate-y-1/2 whitespace-nowrap text-xs',
                label.soon ? 'text-warn' : 'text-muted-foreground',
              )}
              style={{ left: `calc(${pct(child.due)}% + 0.75rem)` }}
            >
              {label.text}
            </span>
          </>
        ) : null}
      </div>
    </div>
  )
}
