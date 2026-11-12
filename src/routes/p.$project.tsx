import { useEffect, useMemo, useState } from 'react'
import {
  Outlet,
  createFileRoute,
  useLocation,
  useNavigate,
} from '@tanstack/react-router'
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
import { TimelineView } from '@/components/timeline-view'
import { BoardSwimlanes } from '@/components/board-swimlanes'
import { ListView, flattenOrder, listGroups } from '@/components/list-view'
import type { ListGroupBy } from '@/components/list-view'
import { BulkActionBar } from '@/components/bulk-action-bar'
import { labelCounts } from '@/lib/labels'
import { toggleSelection } from '@/lib/selection'
import { KanbanColumn } from '@/components/kanban-column'
import { BeadCard } from '@/components/bead-card'
import { BeadDetailModal } from '@/components/bead-detail-modal'
import { CloseBeadDialog } from '@/components/close-bead-dialog'
import { MigrationGateCard } from '@/components/migration-gate-card'
import { HierarchyView } from '@/components/hierarchy-view'
import { KnowledgeDetailModal } from '@/components/knowledge-detail-modal'
import { CreateBeadDialog } from '@/components/create-bead-dialog'
import { ProjectKnowledgePanel } from '@/components/project-knowledge-panel'
import { AgentsView } from '@/components/agents-view'
import { InsightsView } from '@/components/insights-view'
import type { InsightsWeeks } from '@/components/insights-view'
import { ViewPage } from '@/components/view-editor'
import { LiveUpdatesIndicator } from '@/components/live-updates-indicator'
import { Button } from '@/components/ui/button'
import { isDueThisWeek, isOverdue } from '@/lib/schedule'
import { isGate } from '@/lib/lease'
import {
  claimBeadFn,
  getBeads,
  getProjects,
  readyExplainFn,
  updateBeadStatusFn,
} from '@/lib/server'
import { COLUMNS, isEpic, mapStatus } from '@/lib/types'
import { beadMatches, compareBeads } from '@/lib/sort'
import { toErrorMessage } from '@/lib/utils'
import { claimErrorMessage } from '@/lib/ready'
import { getStoredIdentity } from '@/lib/identity'
import { closeRefusalReason } from '@/lib/close-policy'
import {
  migrationGateFromMessage,
  stripMigrationGate,
} from '@/lib/migration-gate'
import { useBeadFeed } from '@/hooks/use-bead-feed'
import { openShortcutsDialog } from '@/components/shortcuts-dialog'
import { useShortcuts } from '@/hooks/use-shortcuts'
import type { BeadAction } from '@/components/bead-detail-modal'
import { ProjectOverview } from '@/components/project-overview'
import { ReadyView } from '@/components/ready-view'

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
  v?: string
  sort?: SortKey
  nested?: string
  due?: 'week' | 'overdue'
  snoozed?: '1'
  new?: '1'
  range?: '4' | '8' | '13'
}

const BOARD_VIEWS = new Set(['status', 'epic', 'priority', 'list', 'timeline'])

const LAST_BOARD_VIEW_KEY = 'bd-board:last-board-view'

/** The grouping the list view uses: the last non-list board view, epic by default. */
function readLastBoardView(): ListGroupBy {
  if (typeof window === 'undefined') return 'epic'
  // localStorage throws in sandboxed frames; fall back to the default view.
  try {
    const stored = window.localStorage.getItem(LAST_BOARD_VIEW_KEY)
    return stored === 'priority' || stored === 'status' ? stored : 'epic'
  } catch {
    return 'epic'
  }
}
const PROJECT_TABS = new Set([
  'overview',
  'board',
  'ready',
  'knowledge',
  'agents',
  'hierarchy',
  'view',
  'insights',
])
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
    new: search.new === '1' ? '1' : undefined,
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
    v:
      typeof search.v === 'string' && search.v.length > 0
        ? search.v
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
    range:
      search.range === '4' || search.range === '8' || search.range === '13'
        ? search.range
        : undefined,
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
  const onSettings = useLocation({
    select: (location) => location.pathname.endsWith('/settings'),
  })
  const queryClient = useQueryClient()

  const [createOpen, setCreateOpen] = useState(false)
  const [activeBead, setActiveBead] = useState<Bead | null>(null)
  const [closing, setClosing] = useState<{
    beads: Bead[]
    refusal?: string
  } | null>(null)
  const [selection, setSelection] = useState<{
    selected: string[]
    anchor?: string
  }>({ selected: [] })
  const [gateOpen, setGateOpen] = useState(false)

  // The command palette's "New bead" navigates here with `?new=1`.
  useEffect(() => {
    if (boardSearch.new !== '1') return
    setCreateOpen(true)
    navigate({
      to: '/p/$project',
      params: { project },
      search: { ...boardSearch, new: undefined },
      replace: true,
    })
  }, [boardSearch, navigate, project])

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

  const readyQuery = useQuery({
    queryKey: ['ready-explain', project],
    queryFn: () => readyExplainFn({ data: { project } }),
    enabled: tab === 'ready',
    retry: false,
  })

  // Keep the Ready view in step with every beads refresh (feed, create, edit, close).
  useEffect(() => {
    if (tab === 'ready') {
      queryClient.invalidateQueries({ queryKey: ['ready-explain', project] })
    }
  }, [beadsQuery.dataUpdatedAt, tab, project, queryClient])

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

  // Gate beads never appear as board work; the Agents panel reads all beads.
  const allBeads = beadsQuery.data ?? []
  const beads = useMemo(() => allBeads.filter((b) => !isGate(b)), [allBeads])

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
    const visible = snoozed
      ? beads
      : beads.filter((b) => b.status !== 'deferred')
    return {
      dueWeek: visible.filter((b) => isDueThisWeek(b, now)).length,
      overdue: visible.filter((b) => isOverdue(b, now)).length,
      snoozed: beads.filter((b) => b.status === 'deferred').length,
    }
  }, [beads, snoozed])

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

  const [pendingAction, setPendingAction] = useState<BeadAction | null>(null)

  const [lastBoardView, setLastBoardView] =
    useState<ListGroupBy>(readLastBoardView)
  useEffect(() => {
    if (view !== 'epic' && view !== 'priority' && view !== 'status') return
    setLastBoardView(view)
    try {
      window.localStorage.setItem(LAST_BOARD_VIEW_KEY, view)
    } catch {
      // Ignore: the list falls back to the default grouping on next load.
    }
  }, [view])
  const listGroupBy = lastBoardView
  const listData = useMemo(
    () =>
      listGroups({
        beads,
        filters: {
          search,
          priorities,
          ready,
          assignee,
          due,
          snoozed,
        },
        groupBy: listGroupBy,
        sort,
        now: new Date(),
      }),
    [
      beads,
      search,
      priorities,
      ready,
      assignee,
      due,
      snoozed,
      listGroupBy,
      sort,
    ],
  )
  const listOrder = useMemo(() => flattenOrder(listData), [listData])
  const selectedBeads = useMemo(
    () =>
      selection.selected
        .map((id) => beadsById.get(id))
        .filter((b): b is Bead => b !== undefined),
    [selection.selected, beadsById],
  )
  const listOrderSet = useMemo(() => new Set(listOrder), [listOrder])
  // Bulk ops act only on selected rows that are still visible.
  const visibleSelected = useMemo(
    () => selection.selected.filter((id) => listOrderSet.has(id)),
    [selection.selected, listOrderSet],
  )
  const labelOptions = useMemo(() => labelCounts(beads), [beads])

  function toggleRow(id: string, shift: boolean) {
    setSelection((prev) =>
      toggleSelection(prev.selected, id, {
        shift,
        order: listOrder,
        anchor: prev.anchor,
      }),
    )
  }

  useEffect(() => {
    if (view !== 'list') setSelection({ selected: [] })
  }, [view])

  // Drop selected rows that filters or deletes hid from the visible order.
  useEffect(() => {
    if (view !== 'list') return
    const visibleIds = new Set(listOrder)
    setSelection((prev) => {
      const next = prev.selected.filter((id) => visibleIds.has(id))
      return next.length === prev.selected.length
        ? prev
        : { selected: next, anchor: prev.anchor }
    })
  }, [view, listOrder])
  const [claimingId, setClaimingId] = useState<string | null>(null)

  // Closing the modal or opening a different bead than the one the action
  // targets drops it; an action raised from a focused card survives the open.
  useEffect(() => {
    setPendingAction((prev) => (prev?.beadId === beadParam ? prev : null))
  }, [beadParam])

  function focusedCard(): HTMLElement | null {
    return (
      document.activeElement?.closest<HTMLElement>('[data-bead-id]') ?? null
    )
  }

  function moveCard(direction: 'next' | 'prev') {
    const cards = Array.from(
      document.querySelectorAll<HTMLElement>('[data-bead-id]'),
    )
    if (cards.length === 0) return
    const current = focusedCard()
    const index = current ? cards.indexOf(current) : -1
    const next =
      direction === 'next'
        ? Math.min(index + 1, cards.length - 1)
        : Math.max(index - 1, 0)
    cards[next]?.focus()
    cards[next]?.scrollIntoView({ block: 'nearest' })
  }

  function moveColumn(direction: 'next' | 'prev') {
    const current = focusedCard()
    const columnEls = Array.from(
      document.querySelectorAll<HTMLElement>('[data-column]'),
    )
    const index = columnEls.findIndex(
      (column) => current !== null && column.contains(current),
    )
    if (index === -1) return
    const step = direction === 'next' ? 1 : -1
    for (let i = index + step; i >= 0 && i < columnEls.length; i += step) {
      const first = columnEls
        .at(i)
        ?.querySelector<HTMLElement>('[data-bead-id]')
      if (first) {
        first.focus()
        first.scrollIntoView({ block: 'nearest' })
        return
      }
    }
  }

  function beadAction(id: string) {
    const targetId = beadParam ?? focusedCard()?.dataset.beadId
    if (!targetId) return
    const bead = beadsById.get(targetId)
    if (targetId !== beadParam && bead) openBead(bead)
    setPendingAction({ id, nonce: Date.now(), beadId: targetId })
  }

  useShortcuts({
    navigateTab: (next) =>
      navigate({
        to: '/p/$project',
        params: { project },
        search: (prev) => ({ ...prev, tab: next }),
      }),
    newBead: () =>
      navigate({
        to: '/p/$project',
        params: { project },
        search: (prev) => ({ ...prev, new: '1' }),
      }),
    showShortcuts: openShortcutsDialog,
    focusSearch: () =>
      document.querySelector<HTMLInputElement>('[data-board-search]')?.focus(),
    moveCard,
    moveColumn,
    beadAction,
    toggleFocusedRow: () => {
      if (view !== 'list') return false
      const row = document.activeElement?.closest<HTMLElement>('[data-list-id]')
      const id = row?.dataset.listId
      if (!id) return false
      toggleRow(id, false)
      return true
    },
    clearSelection: () => {
      if (view !== 'list' || selection.selected.length === 0) return false
      setSelection({ selected: [] })
      return true
    },
    claimFocused: () => {
      const row =
        document.activeElement?.closest<HTMLElement>('[data-ready-id]')
      const id = row?.dataset.readyId
      if (!id) return false
      claim(id)
      return true
    },
  })

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
      if (refusal) setClosing({ beads: [bead], refusal })
      else toast.error(message)
    } finally {
      queryClient.invalidateQueries({ queryKey: ['beads', project] })
    }
  }

  async function claim(id: string) {
    setClaimingId(id)
    try {
      await claimBeadFn({
        data: { project, id, actor: getStoredIdentity() ?? undefined },
      })
      toast.success(`Claimed ${id}`)
    } catch (error) {
      const message = toErrorMessage(error, 'Failed to claim bead')
      toast.error(claimErrorMessage(message) ?? message)
    } finally {
      setClaimingId(null)
      queryClient.invalidateQueries({ queryKey: ['beads', project] })
      queryClient.invalidateQueries({ queryKey: ['ready-explain', project] })
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

  if (onSettings) return <Outlet />

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
          attentionBeads={allBeads}
          liveIndicator={
            <LiveUpdatesIndicator status={feed.status} message={feed.message} />
          }
          onOpen={openBead}
          onOpenKnowledge={openKnowledge}
          onCreate={() => setCreateOpen(true)}
          onClaim={claim}
        />
      ) : tab === 'view' ? (
        <ViewPage
          key={boardSearch.v}
          project={project}
          viewId={boardSearch.v}
          onOpen={openBead}
          onCreated={(created) =>
            patchBoardSearch({ tab: 'view', v: created.id })
          }
          onDeleted={() => patchBoardSearch({ tab: 'board', v: undefined })}
        />
      ) : tab === 'ready' ? (
        readyQuery.isError ? (
          <BoardError
            message={toErrorMessage(
              readyQuery.error,
              'Failed to load ready beads',
            )}
            onRetry={() => readyQuery.refetch()}
          />
        ) : readyQuery.data ? (
          <ReadyView
            data={readyQuery.data}
            beadsById={beadsById}
            beads={beads}
            claimingId={claimingId}
            onClaim={claim}
            onOpen={openBead}
            onCreate={() => setCreateOpen(true)}
          />
        ) : (
          <BoardSkeleton />
        )
      ) : tab === 'insights' ? (
        <InsightsView
          project={project}
          weeks={Number(boardSearch.range ?? '8') as InsightsWeeks}
          beads={beads}
          onWeeksChange={(weeks) =>
            patchBoardSearch({ range: String(weeks) as BoardSearch['range'] })
          }
          onOpen={openBead}
        />
      ) : tab === 'agents' ? (
        <AgentsView
          project={project}
          beads={allBeads}
          onOpen={(id) => {
            const bead = beadsById.get(id)
            if (bead) openBead(bead)
          }}
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
      ) : view === 'timeline' ? (
        <TimelineView
          project={project}
          beads={beads}
          now={new Date()}
          onOpen={openBead}
        />
      ) : view === 'list' ? (
        <div className="relative flex min-h-0 flex-1 flex-col">
          {visibleSelected.length > 0 ? (
            <BulkActionBar
              project={project}
              ids={visibleSelected}
              labelCounts={labelOptions}
              onClear={() => setSelection({ selected: [] })}
              onClose={() =>
                setClosing({
                  beads: selectedBeads.filter((b) => listOrderSet.has(b.id)),
                })
              }
            />
          ) : null}
          <ListView
            className={visibleSelected.length > 0 ? 'pb-24' : undefined}
            groups={listData}
            selected={selection.selected}
            onRowToggle={toggleRow}
            onOpen={openBead}
            now={new Date()}
          />
        </div>
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
        action={pendingAction}
        onActionHandled={() => setPendingAction(null)}
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
        beads={closing?.beads ?? []}
        open={closing !== null}
        onOpenChange={(next) => !next && setClosing(null)}
        onClosed={() => setSelection({ selected: [] })}
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
