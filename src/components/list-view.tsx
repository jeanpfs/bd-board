import { useMemo } from 'react'
import { format } from 'date-fns'
import { Check } from 'lucide-react'

import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { PriorityBadge } from '@/components/priority-badge'
import { isEpic, mapStatus, statusText } from '@/lib/types'
import type { Bead } from '@/lib/types'
import { isGate } from '@/lib/lease'
import { dueState } from '@/lib/schedule'
import { relativeDate } from '@/lib/time'
import { beadMatches, compareBeads, priorityLabel } from '@/lib/sort'
import type { SortKey } from '@/lib/sort'
import { cn } from '@/lib/utils'

export type ListGroupBy = 'epic' | 'priority' | 'status'

export interface ListFilters {
  search: string
  priorities: number[]
  ready: boolean
  assignee: string
  due?: 'week' | 'overdue'
  snoozed: boolean
}

export interface ListGroup {
  key: string
  label: string
  beads: Bead[]
  /** Epic groups: closed children out of all children of the epic. */
  progress?: { done: number; total: number }
}

const NO_EPIC = '__none__'

const STATUS_ORDER = ['open', 'in_progress', 'blocked', 'closed'] as const
const STATUS_LABEL: Record<(typeof STATUS_ORDER)[number], string> = {
  open: 'Open',
  in_progress: 'In progress',
  blocked: 'Blocked',
  closed: 'Closed',
}

/**
 * Filters and groups beads for the list view. Gates are excluded by the
 * caller, like on the board. Order is the flattened group order, which is
 * what shift-click ranges select across.
 */
export function listGroups({
  beads,
  filters,
  groupBy,
  sort,
  now,
}: {
  beads: Bead[]
  filters: ListFilters
  groupBy: ListGroupBy
  sort: SortKey
  now: Date
}): ListGroup[] {
  // Same rules as the board lanes: epics are group headers, never rows.
  const epicIds = new Set(beads.filter(isEpic).map((e) => e.id))
  const work = beads.filter(
    (b) =>
      !isGate(b) &&
      !isEpic(b) &&
      beadMatches(
        b,
        filters.search,
        filters.priorities,
        filters.ready,
        filters.assignee,
        filters.due,
        filters.snoozed,
        now,
      ),
  )
  const compare = compareBeads(sort)
  const sorted = (list: Bead[]) => [...list].sort(compare)

  if (groupBy === 'priority') {
    const byPriority = new Map<number, Bead[]>()
    for (const bead of work) {
      const p = Math.max(0, Math.min(4, bead.priority))
      byPriority.set(p, [...(byPriority.get(p) ?? []), bead])
    }
    return [...byPriority.keys()]
      .sort((a, b) => a - b)
      .map((p) => ({
        key: `p${p}`,
        label: priorityLabel(p),
        beads: sorted(byPriority.get(p) ?? []),
      }))
  }

  if (groupBy === 'status') {
    return STATUS_ORDER.map((column) => ({
      key: column,
      label: STATUS_LABEL[column],
      beads: sorted(work.filter((b) => mapStatus(b).column === column)),
    })).filter((g) => g.beads.length > 0)
  }

  const orphans = work.filter((b) => !b.parent || !epicIds.has(b.parent))
  const epicGroups = beads
    .filter(isEpic)
    .sort(compareBeads('priority'))
    .map((epic) => {
      const children = work.filter((b) => b.parent === epic.id)
      return {
        key: epic.id,
        label: epic.title,
        beads: sorted(children),
        progress: {
          done: children.filter((b) => mapStatus(b).column === 'closed').length,
          total: children.length,
        },
      }
    })
    .filter((g) => g.beads.length > 0)
  return orphans.length > 0
    ? [
        { key: NO_EPIC, label: 'No epic', beads: sorted(orphans) },
        ...epicGroups,
      ]
    : epicGroups
}

export function flattenOrder(groups: ListGroup[]): string[] {
  return groups.flatMap((g) => g.beads.map((b) => b.id))
}

const STATUS_DOT: Record<string, string> = {
  open: 'bg-muted-foreground/50',
  in_progress: 'bg-info',
  blocked: 'bg-destructive',
  closed: 'bg-muted-foreground/30',
}

export function ListView({
  groups,
  selected,
  onRowToggle,
  onOpen,
  now,
  className,
}: {
  groups: ListGroup[]
  selected: string[]
  onRowToggle: (id: string, shift: boolean) => void
  onOpen: (bead: Bead) => void
  now: Date
  className?: string
}) {
  const selectedSet = useMemo(() => new Set(selected), [selected])
  const total = groups.reduce((n, g) => n + g.beads.length, 0)

  return (
    <div className="flex min-h-0 flex-1 flex-col gap-2 pt-2 pb-1">
      <p className="text-xs text-muted-foreground">
        <span className="font-mono tabular-nums">{total}</span>{' '}
        {total === 1 ? 'bead' : 'beads'}
      </p>

      {total === 0 ? (
        <p className="py-10 text-center text-sm text-muted-foreground">
          No beads match these filters.
        </p>
      ) : (
        <div
          role="table"
          aria-label="Beads"
          className={cn(
            'min-h-0 flex-1 overflow-auto rounded-lg ring-1 ring-border',
            className,
          )}
        >
          <div
            role="row"
            className="sticky top-0 z-10 grid grid-cols-[1.25rem_5.5rem_minmax(0,1fr)_7rem_3rem_7rem_minmax(0,10rem)_6rem_6rem] items-center gap-3 bg-muted/60 px-3 py-1.5 text-xs font-medium text-muted-foreground"
          >
            <span role="columnheader" aria-label="Selected" />
            <span role="columnheader">ID</span>
            <span role="columnheader">Title</span>
            <span role="columnheader">Status</span>
            <span role="columnheader">Pri</span>
            <span role="columnheader">Who</span>
            <span role="columnheader">Labels</span>
            <span role="columnheader">Due</span>
            <span role="columnheader">Updated</span>
          </div>

          {groups.map((group) => (
            <section key={group.key} role="rowgroup">
              <div className="border-t border-border bg-muted/30 px-3 py-1 text-xs font-medium text-foreground">
                {group.label}{' '}
                {group.progress ? (
                  <span className="text-muted-foreground">
                    <span className="font-mono tabular-nums">
                      {group.progress.done}/{group.progress.total}
                    </span>{' '}
                    done
                  </span>
                ) : (
                  <span className="font-mono text-muted-foreground tabular-nums">
                    {group.beads.length}
                  </span>
                )}
              </div>
              {group.beads.map((bead) => {
                const isSelected = selectedSet.has(bead.id)
                const { column } = mapStatus(bead)
                const due =
                  bead.due_at && column !== 'closed'
                    ? dueState(bead.due_at, now)
                    : null
                return (
                  <div
                    key={bead.id}
                    role="row"
                    tabIndex={0}
                    data-list-id={bead.id}
                    data-bead-id={bead.id}
                    aria-selected={isSelected}
                    onClick={(event) => onRowToggle(bead.id, event.shiftKey)}
                    onKeyDown={(event) => {
                      if (event.key === 'Enter') {
                        event.preventDefault()
                        onOpen(bead)
                      }
                    }}
                    className={cn(
                      'grid cursor-default grid-cols-[1.25rem_5.5rem_minmax(0,1fr)_7rem_3rem_7rem_minmax(0,10rem)_6rem_6rem] items-center gap-3 border-t border-border px-3 py-1.5 text-sm outline-none select-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-inset',
                      isSelected ? 'bg-primary/10' : 'hover:bg-muted/50',
                    )}
                  >
                    <span role="cell" className="text-muted-foreground">
                      <span
                        role="checkbox"
                        aria-checked={isSelected}
                        aria-label={`Select ${bead.id}`}
                        className={cn(
                          'flex size-4 items-center justify-center rounded-[4px] ring-1 ring-inset',
                          isSelected
                            ? 'bg-primary text-primary-foreground ring-primary'
                            : 'ring-border',
                        )}
                      >
                        {isSelected ? (
                          <Check className="size-3" aria-hidden="true" />
                        ) : null}
                      </span>
                    </span>
                    <span
                      role="cell"
                      className="truncate font-mono text-xs text-muted-foreground"
                    >
                      {bead.id}
                    </span>
                    <span role="cell" className="min-w-0">
                      <Button
                        variant="link"
                        size="sm"
                        className="h-auto max-w-full justify-start truncate p-0 text-foreground"
                        onClick={(event) => {
                          event.stopPropagation()
                          onOpen(bead)
                        }}
                      >
                        {bead.title}
                      </Button>
                    </span>
                    <span
                      role="cell"
                      className="flex items-center gap-1.5 truncate text-xs text-muted-foreground"
                    >
                      <span
                        className={cn(
                          'size-2 shrink-0 rounded-full',
                          STATUS_DOT[column] ?? STATUS_DOT.open,
                        )}
                        aria-hidden="true"
                      />
                      <span className="truncate">{statusText(bead)}</span>
                    </span>
                    <span role="cell">
                      <PriorityBadge priority={bead.priority} />
                    </span>
                    <span
                      role="cell"
                      className="truncate text-xs text-muted-foreground"
                    >
                      {bead.assignee ?? ''}
                    </span>
                    <span role="cell" className="flex min-w-0 flex-wrap gap-1">
                      {(bead.labels ?? []).slice(0, 3).map((label) => (
                        <Badge
                          key={label}
                          variant="outline"
                          className="max-w-full truncate"
                        >
                          {label}
                        </Badge>
                      ))}
                    </span>
                    <span
                      role="cell"
                      className={cn(
                        'truncate font-mono text-xs tabular-nums',
                        due?.kind === 'overdue'
                          ? 'text-destructive'
                          : 'text-muted-foreground',
                      )}
                    >
                      {due ? due.label : ''}
                    </span>
                    <span
                      role="cell"
                      className="truncate font-mono text-xs text-muted-foreground tabular-nums"
                    >
                      {bead.updated_at
                        ? relativeDate(bead.updated_at, now) ||
                          format(new Date(bead.updated_at), 'MMM d')
                        : ''}
                    </span>
                  </div>
                )
              })}
            </section>
          ))}
        </div>
      )}
    </div>
  )
}
