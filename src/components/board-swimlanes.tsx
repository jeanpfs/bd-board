import { useMemo, useState } from 'react'
import {
  DndContext,
  DragOverlay,
  KeyboardSensor,
  PointerSensor,
  closestCorners,
  useDroppable,
  useSensor,
  useSensors,
} from '@dnd-kit/core'
import {
  SortableContext,
  sortableKeyboardCoordinates,
  verticalListSortingStrategy,
} from '@dnd-kit/sortable'
import { ChevronDown, ChevronRight, Layers } from 'lucide-react'

import { BeadCard } from '@/components/bead-card'
import { EpicProgress } from '@/components/epic-progress'
import { StatusColumnHeader } from '@/components/status-column-header'
import { Button } from '@/components/ui/button'
import { cn } from '@/lib/utils'
import { isEpic, mapStatus } from '@/lib/types'
import {
  PRIORITIES,
  PRIORITY_TEXT_CLASS,
  PRIORITY_WORD,
  beadMatches,
  compareBeads,
} from '@/lib/sort'

import type { ReactNode } from 'react'
import type { DragEndEvent, DragStartEvent } from '@dnd-kit/core'
import type { SortKey } from '@/lib/sort'
import type { Bead, BeadColumn } from '@/lib/types'

export type SwimlaneGroup = 'epic' | 'priority'

interface BoardSwimlanesProps {
  beads: Bead[]
  search: string
  priorities: number[]
  ready: boolean
  assignee: string
  sort: SortKey
  groupBy: SwimlaneGroup
  onOpen: (bead: Bead) => void
  applyDrop: (activeId: string, toColumn: BeadColumn) => void
}

const PRIORITY_HINT: Record<number, string> = {
  0: 'highest',
  4: 'lowest',
}

const COLUMN_KEYS: BeadColumn[] = ['open', 'in_progress', 'blocked', 'closed']

const COLUMN_LABEL: Record<BeadColumn, string> = {
  open: 'Open',
  in_progress: 'In progress',
  blocked: 'Blocked',
  closed: 'Closed',
}

function emptyByColumn(): Record<BeadColumn, Bead[]> {
  return { open: [], in_progress: [], blocked: [], closed: [] }
}

function groupByColumn(
  beads: Bead[],
  compare: (a: Bead, b: Bead) => number,
): Record<BeadColumn, Bead[]> {
  const grouped = emptyByColumn()
  for (const b of beads) grouped[mapStatus(b.status).column].push(b)
  for (const key of COLUMN_KEYS) grouped[key].sort(compare)
  return grouped
}

function LaneCell({
  column,
  beads,
  onOpen,
}: {
  column: BeadColumn
  beads: Bead[]
  onOpen: (bead: Bead) => void
}) {
  const { setNodeRef, isOver } = useDroppable({ id: column })
  const ids = useMemo(() => beads.map((b) => b.id), [beads])

  return (
    <div
      ref={setNodeRef}
      className={cn(
        'flex min-h-19 min-w-0 flex-col gap-2 rounded-[10px] bg-canvas p-2 ring-1 ring-inset ring-white/5 transition-colors',
        isOver && 'bg-primary/5 ring-primary/30',
      )}
    >
      <SortableContext items={ids} strategy={verticalListSortingStrategy}>
        {beads.map((bead) => (
          <BeadCard key={bead.id} bead={bead} onOpen={onOpen} />
        ))}
      </SortableContext>
      {beads.length === 0 ? (
        <span className="flex flex-1 items-center justify-center py-3 font-mono text-[11px] text-white/22">
          —
        </span>
      ) : null}
    </div>
  )
}

function SwimLane({
  epic,
  title,
  childBeads,
  sort,
  onOpen,
  applyDrop,
  defaultOpen = true,
}: {
  epic?: Bead
  title?: ReactNode
  childBeads: Bead[]
  sort: SortKey
  onOpen: (bead: Bead) => void
  applyDrop: (activeId: string, toColumn: BeadColumn) => void
  defaultOpen?: boolean
}) {
  const [open, setOpen] = useState(defaultOpen)
  const [activeBead, setActiveBead] = useState<Bead | null>(null)
  const sensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 6 } }),
    useSensor(KeyboardSensor, {
      coordinateGetter: sortableKeyboardCoordinates,
    }),
  )

  const byColumn = useMemo(
    () => groupByColumn(childBeads, compareBeads(sort)),
    [childBeads, sort],
  )
  const beadsById = useMemo(() => {
    const map = new Map<string, Bead>()
    for (const b of childBeads) map.set(b.id, b)
    return map
  }, [childBeads])
  const done = byColumn.closed.length

  function columnOfId(id: string): BeadColumn | null {
    if ((COLUMN_KEYS as string[]).includes(id)) return id as BeadColumn
    const bead = beadsById.get(id)
    return bead ? mapStatus(bead.status).column : null
  }

  function onDragStart(event: DragStartEvent) {
    const dragged = event.active.data.current?.bead as Bead | undefined
    setActiveBead(dragged ?? beadsById.get(String(event.active.id)) ?? null)
  }

  function onDragEnd(event: DragEndEvent) {
    setActiveBead(null)
    const { active, over } = event
    if (!over) return
    const to = columnOfId(String(over.id))
    if (to) applyDrop(String(active.id), to)
  }

  return (
    <section className="flex flex-col gap-2">
      <header className="flex items-center gap-2 rounded-[8px] bg-canvas py-1.5 pr-2.5 pl-1.5 ring-1 ring-inset ring-border">
        <Button
          variant="ghost"
          size="icon-xs"
          onClick={() => setOpen((v) => !v)}
          aria-expanded={open}
          aria-label={open ? 'Recolher faixa' : 'Expandir faixa'}
        >
          {open ? (
            <ChevronDown className="size-4" aria-hidden="true" />
          ) : (
            <ChevronRight className="size-4" aria-hidden="true" />
          )}
        </Button>

        {epic ? (
          <Button
            variant="link"
            onClick={() => onOpen(epic)}
            className="h-auto min-w-0 gap-2 p-0"
          >
            <Layers
              className="size-3.5 shrink-0 text-primary-text"
              aria-hidden="true"
            />
            <span className="font-mono text-[11px] text-muted-foreground">
              {epic.id}
            </span>
            <span className="truncate text-[13px] font-medium tracking-[-0.005em] text-foreground">
              {epic.title}
            </span>
          </Button>
        ) : (
          <span className="flex items-center gap-2 text-[13px] font-medium text-muted-foreground">
            {title}
          </span>
        )}

        <span className="ml-auto flex shrink-0 items-center gap-3">
          {epic ? (
            <span className="hidden w-30 sm:block">
              <EpicProgress childBeads={childBeads} showDots={false} />
            </span>
          ) : null}
          <span className="font-mono text-[11.5px] tabular-nums text-muted-foreground">
            {done}/{childBeads.length}
          </span>
        </span>
      </header>

      {open ? (
        <DndContext
          sensors={sensors}
          collisionDetection={closestCorners}
          onDragStart={onDragStart}
          onDragEnd={onDragEnd}
          onDragCancel={() => setActiveBead(null)}
        >
          <div className="grid grid-cols-1 gap-3 md:grid-cols-2 xl:grid-cols-4">
            {COLUMN_KEYS.map((key) => (
              <LaneCell
                key={key}
                column={key}
                beads={byColumn[key]}
                onOpen={onOpen}
              />
            ))}
          </div>
          <DragOverlay>
            {activeBead ? (
              <BeadCard bead={activeBead} onOpen={() => {}} overlay />
            ) : null}
          </DragOverlay>
        </DndContext>
      ) : null}
    </section>
  )
}

interface Lane {
  key: string
  epic?: Bead
  title?: ReactNode
  children: Bead[]
}

export function BoardSwimlanes({
  beads,
  search,
  priorities,
  ready,
  assignee,
  sort,
  groupBy,
  onOpen,
  applyDrop,
}: BoardSwimlanesProps) {
  const { lanes, totals, hasAny } = useMemo(() => {
    const matches = (b: Bead) =>
      beadMatches(b, search, priorities, ready, assignee)
    const work = beads.filter((b) => !isEpic(b) && matches(b))

    let builtLanes: Lane[]
    if (groupBy === 'priority') {
      builtLanes = PRIORITIES.map((p) => ({
        key: `p${p}`,
        title: (
          <>
            <span
              className={cn(
                'rounded-[4px] px-1.5 py-px font-mono text-[11px] font-semibold ring-1 ring-inset ring-current',
                PRIORITY_TEXT_CLASS[p],
              )}
            >
              P{p}
            </span>
            <span className="text-foreground">{PRIORITY_WORD[p]}</span>
            {PRIORITY_HINT[p] ? (
              <span className="text-[11.5px] text-faint">
                · {PRIORITY_HINT[p]}
              </span>
            ) : null}
          </>
        ),
        children: work.filter((b) => b.priority === p),
      })).filter((lane) => lane.children.length > 0)
    } else {
      const epics = beads.filter(isEpic)
      const epicIds = new Set(epics.map((e) => e.id))

      const childrenByEpic = new Map<string, Bead[]>()
      for (const b of work) {
        if (b.parent && epicIds.has(b.parent)) {
          const list = childrenByEpic.get(b.parent) ?? []
          list.push(b)
          childrenByEpic.set(b.parent, list)
        }
      }

      const epicOrder = [...epics].sort(compareBeads('priority'))
      const epicLanes = epicOrder
        .map((epic) => ({
          key: epic.id,
          epic,
          children: childrenByEpic.get(epic.id) ?? [],
        }))
        .filter((lane) => lane.children.length > 0)

      const orphans = work.filter((b) => !b.parent || !epicIds.has(b.parent))

      builtLanes =
        orphans.length > 0
          ? [
              { key: 'no-epic', title: 'No epic', children: orphans },
              ...epicLanes,
            ]
          : epicLanes
    }

    const totalByColumn = emptyByColumn()
    for (const b of work) totalByColumn[mapStatus(b.status).column].push(b)

    return {
      lanes: builtLanes,
      totals: totalByColumn,
      hasAny: builtLanes.length > 0,
    }
  }, [beads, search, priorities, ready, assignee, groupBy])

  if (!hasAny) {
    return (
      <div className="flex flex-1 items-center justify-center">
        <span className="text-sm text-muted-foreground/60">
          No beads match the filters
        </span>
      </div>
    )
  }

  return (
    <div className="min-h-0 flex-1 overflow-y-auto pb-2">
      <div className="sticky top-0 z-10 grid grid-cols-1 gap-3 bg-background/92 pt-3 pb-2.5 backdrop-blur-[8px] md:grid-cols-2 xl:grid-cols-4">
        {COLUMN_KEYS.map((key) => (
          <StatusColumnHeader
            key={key}
            column={key}
            label={COLUMN_LABEL[key]}
            count={totals[key].length}
          />
        ))}
      </div>

      <div className="flex flex-col gap-3.5">
        {lanes.map((lane) => (
          <SwimLane
            key={lane.key}
            epic={lane.epic}
            title={lane.title}
            childBeads={lane.children}
            sort={sort}
            onOpen={onOpen}
            applyDrop={applyDrop}
          />
        ))}
      </div>
    </div>
  )
}
