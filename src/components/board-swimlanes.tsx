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
import { cn } from '@/lib/utils'
import { isEpic, mapStatus } from '@/lib/types'
import { beadMatches, compareBeads } from '@/lib/sort'

import type { DragEndEvent, DragStartEvent } from '@dnd-kit/core'
import type { SortKey } from '@/lib/sort'
import type { Bead, BeadColumn } from '@/lib/types'

interface BoardSwimlanesProps {
  beads: Bead[]
  search: string
  priorities: number[]
  sort: SortKey
  onOpen: (bead: Bead) => void
  applyDrop: (activeId: string, toColumn: BeadColumn) => void
}

const COLUMN_KEYS: BeadColumn[] = ['open', 'in_progress', 'blocked', 'closed']

const COLUMN_LABEL: Record<BeadColumn, string> = {
  open: 'Aberto',
  in_progress: 'Em progresso',
  blocked: 'Bloqueado',
  closed: 'Fechado',
}

const DOT_CLASS: Record<BeadColumn, string> = {
  open: 'bg-status-open',
  in_progress: 'bg-status-progress',
  blocked: 'bg-status-blocked',
  closed: 'bg-status-closed',
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
        'flex min-h-20 min-w-0 flex-col gap-2 rounded-lg bg-muted/20 p-2 ring-1 ring-inset ring-foreground/5 transition-colors',
        isOver && 'bg-primary/5 ring-primary/30',
      )}
    >
      <SortableContext items={ids} strategy={verticalListSortingStrategy}>
        {beads.map((bead) => (
          <BeadCard key={bead.id} bead={bead} onOpen={onOpen} />
        ))}
      </SortableContext>
      {beads.length === 0 ? (
        <span className="flex flex-1 items-center justify-center py-3 text-[0.7rem] text-muted-foreground/30">
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
  title?: string
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
      <header className="flex items-center gap-2 rounded-lg bg-card/60 px-2 py-1.5 ring-1 ring-inset ring-foreground/10">
        <button
          type="button"
          onClick={() => setOpen((v) => !v)}
          aria-expanded={open}
          aria-label={open ? 'Recolher faixa' : 'Expandir faixa'}
          className="flex size-6 shrink-0 items-center justify-center rounded text-muted-foreground transition-colors hover:bg-accent/50 hover:text-foreground focus-visible:ring-2 focus-visible:ring-ring/60 focus-visible:outline-none"
        >
          {open ? (
            <ChevronDown className="size-4" aria-hidden="true" />
          ) : (
            <ChevronRight className="size-4" aria-hidden="true" />
          )}
        </button>

        {epic ? (
          <button
            type="button"
            onClick={() => onOpen(epic)}
            className="flex min-w-0 items-center gap-2 rounded text-left outline-none focus-visible:ring-2 focus-visible:ring-ring/60"
          >
            <Layers
              className="size-3.5 shrink-0 text-primary"
              aria-hidden="true"
            />
            <span className="font-mono text-[0.7rem] text-muted-foreground">
              {epic.id}
            </span>
            <span className="truncate text-sm font-medium text-foreground hover:text-primary">
              {epic.title}
            </span>
          </button>
        ) : (
          <span className="flex items-center gap-2 text-sm font-medium text-muted-foreground">
            {title}
          </span>
        )}

        <span className="ml-auto flex shrink-0 items-center gap-3">
          {epic ? (
            <span className="hidden w-40 sm:block">
              <EpicProgress childBeads={childBeads} showDots={false} />
            </span>
          ) : null}
          <span className="text-xs tabular-nums text-muted-foreground">
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

export function BoardSwimlanes({
  beads,
  search,
  priorities,
  sort,
  onOpen,
  applyDrop,
}: BoardSwimlanesProps) {
  const { lanes, noEpic, totals, hasAny } = useMemo(() => {
    const matches = (b: Bead) => beadMatches(b, search, priorities)
    const epics = beads.filter(isEpic)
    const epicIds = new Set(epics.map((e) => e.id))

    const childrenByEpic = new Map<string, Bead[]>()
    for (const b of beads) {
      if (b.parent && epicIds.has(b.parent) && matches(b)) {
        const list = childrenByEpic.get(b.parent) ?? []
        list.push(b)
        childrenByEpic.set(b.parent, list)
      }
    }

    const epicOrder = [...epics].sort(compareBeads('priority'))
    const builtLanes = epicOrder
      .map((epic) => ({ epic, children: childrenByEpic.get(epic.id) ?? [] }))
      .filter((lane) => lane.children.length > 0)

    const orphans = beads.filter(
      (b) => !isEpic(b) && (!b.parent || !epicIds.has(b.parent)) && matches(b),
    )

    const totalByColumn = emptyByColumn()
    for (const b of beads) {
      if (isEpic(b) || !matches(b)) continue
      totalByColumn[mapStatus(b.status).column].push(b)
    }

    return {
      lanes: builtLanes,
      noEpic: orphans,
      totals: totalByColumn,
      hasAny: builtLanes.length > 0 || orphans.length > 0,
    }
  }, [beads, search, priorities])

  if (!hasAny) {
    return (
      <div className="flex flex-1 items-center justify-center">
        <span className="text-sm text-muted-foreground/60">
          Nenhuma bead corresponde aos filtros
        </span>
      </div>
    )
  }

  return (
    <div className="min-h-0 flex-1 overflow-y-auto pb-2">
      <div className="sticky top-0 z-10 grid grid-cols-1 gap-3 bg-background pb-2 md:grid-cols-2 xl:grid-cols-4">
        {COLUMN_KEYS.map((key) => (
          <div key={key} className="flex min-w-0 items-center gap-2">
            <span
              className={cn('size-2 shrink-0 rounded-full', DOT_CLASS[key])}
              aria-hidden="true"
            />
            <h2 className="truncate text-sm font-medium tracking-tight text-foreground">
              {COLUMN_LABEL[key]}
            </h2>
            <span className="text-xs tabular-nums text-muted-foreground">
              {totals[key].length}
            </span>
          </div>
        ))}
      </div>

      <div className="flex flex-col gap-4">
        {noEpic.length > 0 ? (
          <SwimLane
            title="Sem épico"
            childBeads={noEpic}
            sort={sort}
            onOpen={onOpen}
            applyDrop={applyDrop}
            defaultOpen
          />
        ) : null}
        {lanes.map((lane) => (
          <SwimLane
            key={lane.epic.id}
            epic={lane.epic}
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
