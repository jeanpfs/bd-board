import { useMemo, useState } from 'react'
import { createFileRoute, useNavigate } from '@tanstack/react-router'
import { useQuery, useQueryClient } from '@tanstack/react-query'
import {
  DndContext,
  DragOverlay,
  KeyboardSensor,
  PointerSensor,
  closestCorners,
  useSensor,
  useSensors,
} from '@dnd-kit/core'
import { sortableKeyboardCoordinates } from '@dnd-kit/sortable'
import { toast } from 'sonner'

import { BoardHeader } from '@/components/board-header'
import { BoardSwimlanes } from '@/components/board-swimlanes'
import { KanbanColumn } from '@/components/kanban-column'
import { BeadCard } from '@/components/bead-card'
import { BeadDetailModal } from '@/components/bead-detail-modal'
import { CloseBeadDialog } from '@/components/close-bead-dialog'
import { MigrationGateCard } from '@/components/migration-gate-card'
import { HierarchyView } from '@/components/hierarchy-view'
import { KnowledgeDetailModal } from '@/components/knowledge-detail-modal'
import { CreateBeadDialog } from '@/components/create-bead-dialog'
import { ProjectKnowledgePanel } from '@/components/project-knowledge-panel'
import { LiveUpdatesIndicator } from '@/components/live-updates-indicator'
import { Button } from '@/components/ui/button'
import { isDueThisWeek, isOverdue } from '@/lib/schedule'
import { getBeads, getProjects, updateBeadStatusFn } from '@/lib/server'
import { COLUMNS, isEpic, mapStatus } from '@/lib/types'
import { beadMatches, compareBeads } from '@/lib/sort'
import { toErrorMessage } from '@/lib/utils'
import { closeRefusalReason } from '@/lib/close-policy'
import {
  migrationGateFromMessage,
  stripMigrationGate,
} from '@/lib/migration-gate'
import { useBeadFeed } from '@/hooks/use-bead-feed'
import { ProjectOverview } from '@/components/project-overview'

import type { DragEndEvent, DragStartEvent } from '@dnd-kit/core'
import type { BoardView, ProjectTab } from '@/components/board-header'
import type { SortKey } from '@/lib/sort'
import type { Bead, BeadColumn } from '@/lib/types'

interface BoardSearch {
  bead?: string
  k?: string
  q?: string
  p?: string
  ready?: string
  assignee?: string
  tab?: ProjectTab
  view?: BoardView
  sort?: SortKey
  nested?: string
  due?: 'week' | 'overdue'
  snoozed?: '1'
}

const BOARD_VIEWS = new Set(['status', 'epic', 'priority'])
const PROJECT_TABS = new Set(['overview', 'board', 'knowledge', 'hierarchy'])
const SORT_KEYS = new Set(['priority', 'recent', 'title'])

function parsePriorityParam(value?: string): number[] {
  if (!value) return []
  return Array.from(
    new Set(
      value
        .split(',')
        .map((part) => Number(part))
        .filter(
          (priority) =>
            Number.isInteger(priority) && priority >= 0 && priority <= 4,
        ),
    ),
  ).sort((a, b) => a - b)
}

function serializePriorities(values: number[]): string | undefined {
  return values.length > 0 ? values.join(',') : undefined
}

export const Route = createFileRoute('/p/$project')({
  validateSearch: (search: Record<string, unknown>): BoardSearch => ({
    bead:
      typeof search.bead === 'string' && search.bead.length > 0
        ? search.bead
        : undefined,
    k:
      typeof search.k === 'string' && search.k.length > 0
        ? search.k
        : undefined,
    q: typeof search.q === 'string' && search.q.trim() ? search.q : undefined,
    p:
      typeof search.p === 'string'
        ? serializePriorities(parsePriorityParam(search.p))
        : undefined,
    ready: search.ready === '1' ? '1' : undefined,
    assignee:
      typeof search.assignee === 'string' && search.assignee.length > 0
        ? search.assignee
        : undefined,
    tab:
      typeof search.tab === 'string' && PROJECT_TABS.has(search.tab)
        ? (search.tab as ProjectTab)
        : undefined,
    view:
      typeof search.view === 'string' && BOARD_VIEWS.has(search.view)
        ? (search.view as BoardView)
        : undefined,
    sort:
      typeof search.sort === 'string' && SORT_KEYS.has(search.sort)
        ? (search.sort as SortKey)
        : undefined,
    nested: search.nested === '1' ? '1' : undefined,
    due:
      search.due === 'week' || search.due === 'overdue'
        ? search.due
        : undefined,
    snoozed: search.snoozed === '1' ? '1' : undefined,
  }),
  component: BoardPage,
})

const COLUMN_LABEL: Record<BeadColumn, string> = {
  open: 'Open',
  in_progress: 'In progress',
  blocked: 'Blocked',
  closed: 'Closed',
}

const COLUMN_KEYS: BeadColumn[] = ['open', 'in_progress', 'blocked', 'closed']

function BoardPage() {
  const { project } = Route.useParams()
  const boardSearch = Route.useSearch()
  const navigate = useNavigate()
  const queryClient = useQueryClient()

  const [createOpen, setCreateOpen] = useState(false)
  const [activeBead, setActiveBead] = useState<Bead | null>(null)
  const [closing, setClosing] = useState<{
    bead: Bead
    refusal: string
  } | null>(null)
  const [gateOpen, setGateOpen] = useState(false)

  const beadParam = boardSearch.bead
  const knowledgeParam = boardSearch.k
  const search = boardSearch.q ?? ''
  const tab = boardSearch.tab ?? 'overview'
  const view = boardSearch.view ?? 'epic'
  const priorities = useMemo(
    () => parsePriorityParam(boardSearch.p),
    [boardSearch.p],
  )
  const ready = boardSearch.ready === '1'
  const assignee = boardSearch.assignee ?? ''
  const sort = boardSearch.sort ?? 'priority'
  const nested = boardSearch.nested === '1'
  const due = boardSearch.due
  const snoozed = boardSearch.snoozed === '1'

  const sensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 6 } }),
    useSensor(KeyboardSensor, {
      coordinateGetter: sortableKeyboardCoordinates,
    }),
  )

  const feed = useBeadFeed(project)

  const beadsQuery = useQuery({
    queryKey: ['beads', project],
    queryFn: () => getBeads({ data: { project } }),
    refetchInterval: feed.status === 'live' ? 60_000 : 8_000,
    staleTime: 3000,
    retry: false,
  })

  // Shares the rail's query; the dashboard learns about pending migrations
  // from `bd count`, which still works on a gated database.
  const projectsQuery = useQuery({
    queryKey: ['projects'],
    queryFn: () => getProjects(),
    staleTime: 5000,
  })
  const projectInfo = projectsQuery.data?.find((p) => p.id === project)
  const migration = projectInfo?.migration ?? null
  const loadError = beadsQuery.isError
    ? beadsQuery.error instanceof Error
      ? beadsQuery.error.message
      : String(beadsQuery.error)
    : null
  const loadGate = loadError ? migrationGateFromMessage(loadError) : null

  const beads = beadsQuery.data ?? []

  const beadsById = useMemo(() => {
    const map = new Map<string, Bead>()
    for (const bead of beads) map.set(bead.id, bead)
    return map
  }, [beads])

  const epics = useMemo(() => beads.filter(isEpic), [beads])

  const filtered = useMemo(
    () =>
      beads.filter(
        (bead) =>
          beadMatches(
            bead,
            search,
            priorities,
            ready,
            assignee,
            due,
            snoozed,
          ) &&
          (!nested || !bead.parent),
      ),
    [beads, search, priorities, ready, assignee, nested, due, snoozed],
  )

  const counts = useMemo(() => {
    const now = new Date()
    return {
      dueWeek: beads.filter((b) => isDueThisWeek(b, now)).length,
      overdue: beads.filter((b) => isOverdue(b, now)).length,
      snoozed: beads.filter((b) => b.status === 'deferred').length,
    }
  }, [beads])

  const columns = useMemo(() => {
    const grouped: Record<BeadColumn, Bead[]> = {
      open: [],
      in_progress: [],
      blocked: [],
      closed: [],
    }
    for (const bead of filtered) grouped[mapStatus(bead).column].push(bead)
    const compare = compareBeads(sort)
    for (const key of COLUMN_KEYS) grouped[key].sort(compare)
    return grouped
  }, [filtered, sort])

  const selected = beadParam ? (beadsById.get(beadParam) ?? null) : null
  const modalOpen = beadParam !== undefined

  function openBead(bead: Bead) {
    navigate({
      to: '.',
      search: (prev) => ({ ...prev, bead: bead.id, k: undefined }),
    })
  }

  function openKnowledge(id: string) {
    navigate({
      to: '.',
      search: (prev) => ({ ...prev, k: id, bead: undefined }),
    })
  }

  function setKnowledgeOpen(next: boolean) {
    if (!next)
      navigate({ to: '.', search: (prev) => ({ ...prev, k: undefined }) })
  }

  function patchBoardSearch(patch: Partial<BoardSearch>) {
    navigate({
      to: '.',
      replace: true,
      search: (prev) => ({ ...prev, ...patch }),
    })
  }

  function setModalOpen(next: boolean) {
    if (!next)
      navigate({ to: '.', search: (prev) => ({ ...prev, bead: undefined }) })
  }

  async function applyDrop(activeId: string, toColumn: BeadColumn) {
    const previous = queryClient.getQueryData<Bead[]>(['beads', project])
    const bead = (previous ?? beads).find((b) => b.id === activeId)
    if (!bead || mapStatus(bead).column === toColumn) return

    queryClient.setQueryData<Bead[]>(['beads', project], (old) =>
      (old ?? []).map((b) =>
        b.id === activeId ? { ...b, status: toColumn } : b,
      ),
    )
    try {
      await updateBeadStatusFn({
        data: { project, id: activeId, status: toColumn },
      })
    } catch (error) {
      queryClient.setQueryData(['beads', project], previous)
      const message = toErrorMessage(error, 'Failed to move bead')
      const refusal = toColumn === 'closed' ? closeRefusalReason(message) : null
      if (refusal) setClosing({ bead, refusal })
      else toast.error(message)
    } finally {
      queryClient.invalidateQueries({ queryKey: ['beads', project] })
    }
  }

  function columnOfId(id: string): BeadColumn | null {
    if ((COLUMN_KEYS as string[]).includes(id)) return id as BeadColumn
    const bead = beadsById.get(id)
    return bead ? mapStatus(bead).column : null
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
      {tab === 'board' ? (
        <BoardHeader
          search={search}
          setSearch={(value) =>
            patchBoardSearch({ q: value.trim() ? value : undefined })
          }
          view={view}
          setView={(value) => patchBoardSearch({ view: value })}
          priorities={priorities}
          setPriorities={(values) =>
            patchBoardSearch({ p: serializePriorities(values) })
          }
          ready={ready}
          setReady={(value) =>
            patchBoardSearch({ ready: value ? '1' : undefined })
          }
          assignee={assignee}
          setAssignee={(value) =>
            patchBoardSearch({ assignee: value || undefined })
          }
          due={due}
          setDue={(value) => patchBoardSearch({ due: value })}
          snoozed={snoozed}
          setSnoozed={(value) =>
            patchBoardSearch({ snoozed: value ? '1' : undefined })
          }
          dueWeekCount={counts.dueWeek}
          overdueCount={counts.overdue}
          snoozedCount={counts.snoozed}
          sort={sort}
          setSort={(value) => patchBoardSearch({ sort: value })}
          nested={nested}
          setNested={(value) =>
            patchBoardSearch({ nested: value ? '1' : undefined })
          }
          onCreate={() => setCreateOpen(true)}
          liveIndicator={
            <LiveUpdatesIndicator status={feed.status} message={feed.message} />
          }
        />
      ) : null}

      {migration && !loadGate ? (
        <div className="mb-2 flex flex-col gap-2">
          <div className="flex items-center gap-2 rounded-lg bg-warn/10 px-3 py-1.5 text-xs ring-1 ring-inset ring-warn/30">
            <span className="min-w-0 flex-1 text-muted-foreground">
              <span className="font-medium text-warn">Read-only.</span> Schema
              migration pending (v{migration.currentVersion} → v
              {migration.latestVersion}); bd blocks writes until one clone
              migrates.
            </span>
            <Button
              size="sm"
              variant="ghost"
              className="h-6 px-2 text-xs"
              aria-expanded={gateOpen}
              onClick={() => setGateOpen((v) => !v)}
            >
              {gateOpen ? 'Hide options' : 'Show options'}
            </Button>
          </div>
          {gateOpen ? <MigrationGateCard gate={migration} /> : null}
        </div>
      ) : null}

      {beadsQuery.isLoading ? (
        <BoardSkeleton />
      ) : loadGate ? (
        <div className="flex flex-1 items-start justify-center overflow-y-auto pt-6">
          <MigrationGateCard
            gate={loadGate}
            detail={stripMigrationGate(loadError!)
              .split('\n')
              .slice(1)
              .join('\n')}
            onRetry={() => beadsQuery.refetch()}
          />
        </div>
      ) : beadsQuery.isError ? (
        <BoardError
          message={toErrorMessage(beadsQuery.error, 'Failed to load beads')}
          onRetry={() => beadsQuery.refetch()}
        />
      ) : tab === 'overview' ? (
        <ProjectOverview
          project={project}
          name={projectInfo?.name ?? project}
          beads={beads}
          liveIndicator={
            <LiveUpdatesIndicator status={feed.status} message={feed.message} />
          }
          onOpen={openBead}
          onOpenKnowledge={openKnowledge}
          onCreate={() => setCreateOpen(true)}
        />
      ) : tab === 'knowledge' ? (
        <ProjectKnowledgePanel
          project={project}
          beadsById={beadsById}
          onOpenBead={openBead}
          onOpenKnowledge={openKnowledge}
          refetchInterval={feed.status === 'live' ? 60_000 : 12_000}
        />
      ) : tab === 'hierarchy' ? (
        <HierarchyView beads={beads} onOpen={openBead} />
      ) : view === 'epic' || view === 'priority' ? (
        <BoardSwimlanes
          beads={beads}
          search={search}
          priorities={priorities}
          ready={ready}
          assignee={assignee}
          due={due}
          snoozed={snoozed}
          sort={sort}
          groupBy={view}
          nested={nested}
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
          <div className="grid min-h-0 flex-1 grid-cols-1 gap-3 pt-2 pb-1 md:grid-cols-2 xl:grid-cols-4">
            {COLUMNS.map((c) => (
              <KanbanColumn
                key={c.key}
                column={c.key}
                label={COLUMN_LABEL[c.key]}
                beads={columns[c.key]}
                onOpen={openBead}
                nested={nested}
              />
            ))}
          </div>
          <DragOverlay>
            {activeBead ? (
              <BeadCard bead={activeBead} onOpen={() => {}} overlay />
            ) : null}
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
        onOpenKnowledge={openKnowledge}
      />
      <KnowledgeDetailModal
        project={project}
        knowledgeId={knowledgeParam ?? null}
        open={knowledgeParam !== undefined}
        onOpenChange={setKnowledgeOpen}
        beadsById={beadsById}
        onOpenBead={openBead}
        onOpenKnowledge={openKnowledge}
      />
      <CreateBeadDialog
        project={project}
        epics={epics}
        open={createOpen}
        onOpenChange={setCreateOpen}
      />
      <CloseBeadDialog
        project={project}
        bead={closing?.bead ?? null}
        open={closing !== null}
        onOpenChange={(next) => !next && setClosing(null)}
        refusal={closing?.refusal}
      />
    </div>
  )
}

function BoardSkeleton() {
  return (
    <div className="grid min-h-0 flex-1 grid-cols-1 gap-3 overflow-hidden md:grid-cols-2 xl:grid-cols-4">
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
        <Button size="sm" onClick={onRetry}>
          Try again
        </Button>
      </div>
    </div>
  )
}
