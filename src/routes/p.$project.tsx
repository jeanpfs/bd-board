import { useMemo, useState } from 'react'
import { createFileRoute, useNavigate } from '@tanstack/react-router'
import { useQuery, useQueryClient } from '@tanstack/react-query'
import {
  DndContext,
  DragOverlay,
  PointerSensor,
  closestCorners,
  useSensor,
  useSensors,
} from '@dnd-kit/core'
import { toast } from 'sonner'

import { BoardHeader } from '@/components/board-header'
import { BoardSwimlanes } from '@/components/board-swimlanes'
import { KanbanColumn } from '@/components/kanban-column'
import { BeadCard } from '@/components/bead-card'
import { BeadDetailModal } from '@/components/bead-detail-modal'
import { CreateBeadDialog } from '@/components/create-bead-dialog'
import { getBeads, updateBeadStatusFn } from '@/lib/server'
import { COLUMNS, isEpic, mapStatus } from '@/lib/types'
import { beadMatches, compareBeads } from '@/lib/sort'

import type { DragEndEvent, DragStartEvent } from '@dnd-kit/core'
import type { BoardView } from '@/components/board-header'
import type { SortKey } from '@/lib/sort'
import type { Bead, BeadColumn } from '@/lib/types'

interface BoardSearch {
  bead?: string
}

export const Route = createFileRoute('/p/$project')({
  validateSearch: (search: Record<string, unknown>): BoardSearch => ({
    bead:
      typeof search.bead === 'string' && search.bead.length > 0
        ? search.bead
        : undefined,
  }),
  component: BoardPage,
})

const COLUMN_LABEL: Record<BeadColumn, string> = {
  open: 'Aberto',
  in_progress: 'Em progresso',
  blocked: 'Bloqueado',
  closed: 'Fechado',
}

const COLUMN_KEYS: BeadColumn[] = ['open', 'in_progress', 'blocked', 'closed']

function BoardPage() {
  const { project } = Route.useParams()
  const { bead: beadParam } = Route.useSearch()
  const navigate = useNavigate()
  const queryClient = useQueryClient()

  const [search, setSearch] = useState('')
  const [view, setView] = useState<BoardView>('epic')
  const [priorities, setPriorities] = useState<number[]>([])
  const [sort, setSort] = useState<SortKey>('priority')
  const [createOpen, setCreateOpen] = useState(false)
  const [activeBead, setActiveBead] = useState<Bead | null>(null)

  const sensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 6 } }),
  )

  const beadsQuery = useQuery({
    queryKey: ['beads', project],
    queryFn: () => getBeads({ data: { project } }),
    refetchInterval: 8000,
    staleTime: 3000,
  })

  const beads = beadsQuery.data ?? []

  const beadsById = useMemo(() => {
    const map = new Map<string, Bead>()
    for (const bead of beads) map.set(bead.id, bead)
    return map
  }, [beads])

  const epics = useMemo(() => beads.filter(isEpic), [beads])

  const filtered = useMemo(
    () => beads.filter((bead) => beadMatches(bead, search, priorities)),
    [beads, search, priorities],
  )

  const columns = useMemo(() => {
    const grouped: Record<BeadColumn, Bead[]> = {
      open: [],
      in_progress: [],
      blocked: [],
      closed: [],
    }
    for (const bead of filtered) grouped[mapStatus(bead.status).column].push(bead)
    const compare = compareBeads(sort)
    for (const key of COLUMN_KEYS) grouped[key].sort(compare)
    return grouped
  }, [filtered, sort])

  const selected = beadParam ? (beadsById.get(beadParam) ?? null) : null
  const modalOpen = beadParam !== undefined

  function openBead(bead: Bead) {
    navigate({ to: '.', search: (prev) => ({ ...prev, bead: bead.id }) })
  }

  function setModalOpen(next: boolean) {
    if (!next) navigate({ to: '.', search: (prev) => ({ ...prev, bead: undefined }) })
  }

  async function applyDrop(activeId: string, toColumn: BeadColumn) {
    const previous = queryClient.getQueryData<Bead[]>(['beads', project])
    const bead = (previous ?? beads).find((b) => b.id === activeId)
    if (!bead || mapStatus(bead.status).column === toColumn) return

    queryClient.setQueryData<Bead[]>(['beads', project], (old) =>
      (old ?? []).map((b) => (b.id === activeId ? { ...b, status: toColumn } : b)),
    )
    try {
      await updateBeadStatusFn({ data: { project, id: activeId, status: toColumn } })
    } catch (error) {
      queryClient.setQueryData(['beads', project], previous)
      toast.error(error instanceof Error ? error.message : 'Falha ao mover bead')
    } finally {
      queryClient.invalidateQueries({ queryKey: ['beads', project] })
    }
  }

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
    <div className="flex h-[calc(100dvh-6rem)] min-h-0 flex-col">
      <BoardHeader
        project={project}
        beads={filtered}
        search={search}
        setSearch={setSearch}
        view={view}
        setView={setView}
        priorities={priorities}
        setPriorities={setPriorities}
        sort={sort}
        setSort={setSort}
        onCreate={() => setCreateOpen(true)}
      />

      {beadsQuery.isLoading ? (
        <BoardSkeleton />
      ) : beadsQuery.isError ? (
        <BoardError
          message={
            beadsQuery.error instanceof Error
              ? beadsQuery.error.message
              : 'Erro ao carregar beads'
          }
          onRetry={() => beadsQuery.refetch()}
        />
      ) : view === 'epic' ? (
        <BoardSwimlanes
          beads={beads}
          search={search}
          priorities={priorities}
          sort={sort}
          onOpen={openBead}
          applyDrop={applyDrop}
        />
      ) : (
        <DndContext
          sensors={sensors}
          collisionDetection={closestCorners}
          onDragStart={onDragStart}
          onDragEnd={onDragEnd}
          onDragCancel={() => setActiveBead(null)}
        >
          <div className="grid min-h-0 flex-1 grid-cols-4 gap-3 pb-1">
            {COLUMNS.map((c) => (
              <KanbanColumn
                key={c.key}
                column={c.key}
                label={COLUMN_LABEL[c.key]}
                beads={columns[c.key]}
                onOpen={openBead}
              />
            ))}
          </div>
          <DragOverlay>
            {activeBead ? <BeadCard bead={activeBead} onOpen={() => {}} overlay /> : null}
          </DragOverlay>
        </DndContext>
      )}

      <BeadDetailModal
        project={project}
        bead={selected}
        open={modalOpen}
        onOpenChange={setModalOpen}
        onOpenBead={openBead}
        resolveBead={(id) => beadsById.get(id)}
      />
      <CreateBeadDialog
        project={project}
        epics={epics}
        open={createOpen}
        onOpenChange={setCreateOpen}
      />
    </div>
  )
}

function BoardSkeleton() {
  return (
    <div className="grid min-h-0 flex-1 grid-cols-4 gap-3 overflow-hidden">
      {COLUMNS.map((c) => (
        <div key={c.key} className="flex h-full min-w-0 flex-col gap-2">
          <div className="h-5 w-24 rounded bg-muted/60" />
          <div className="flex-1 rounded-xl bg-muted/20 ring-1 ring-inset ring-foreground/5" />
        </div>
      ))}
    </div>
  )
}

function BoardError({
  message,
  onRetry,
}: {
  message: string
  onRetry: () => void
}) {
  return (
    <div className="flex flex-1 items-center justify-center">
      <div className="flex max-w-sm flex-col items-center gap-3 rounded-xl border border-destructive/30 bg-destructive/5 px-6 py-8 text-center">
        <p className="text-sm text-muted-foreground">{message}</p>
        <button
          type="button"
          onClick={onRetry}
          className="rounded-md bg-primary px-3 py-1.5 text-sm font-medium text-primary-foreground transition-colors hover:bg-primary/90"
        >
          Tentar novamente
        </button>
      </div>
    </div>
  )
}
