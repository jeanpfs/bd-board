import { useEffect, useRef, useState } from 'react'
import {
  keepPreviousData,
  useMutation,
  useQuery,
  useQueryClient,
} from '@tanstack/react-query'
import { toast } from 'sonner'

import { KanbanColumn } from '@/components/kanban-column'
import { Button } from '@/components/ui/button'
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog'
import { Input } from '@/components/ui/input'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'
import { Label } from '@/components/ui/label'
import {
  getBeads,
  kvGetFn,
  kvSetFn,
  queryBeadsFn,
  validateQueryFn,
} from '@/lib/server'
import {
  DEFAULT_VIEW_GROUP,
  DEFAULT_VIEW_SORT,
  VIEW_GROUP_OPTIONS,
  VIEWS_KV_KEY,
  VIEW_NAME_MAX_LENGTH,
  mergeViews,
  newViewId,
  parseViews,
  personalViewsKey,
  parseViewGroup,
  parseViewSort,
  queryTextError,
} from '@/lib/views'
import type { SavedView, ViewGroupBy } from '@/lib/views'
import { compareBeads, priorityLabel, SORT_OPTIONS } from '@/lib/sort'
import type { SortKey } from '@/lib/sort'
import { COLUMNS, mapStatus } from '@/lib/types'
import type { Bead } from '@/lib/types'
import { cn, toErrorMessage } from '@/lib/utils'

function readPersonalViews(project: string): SavedView[] {
  if (typeof window === 'undefined') return []
  try {
    return parseViews(
      window.localStorage.getItem(personalViewsKey(project)) ?? '[]',
    )
  } catch {
    return []
  }
}

function upsertView(list: SavedView[], view: SavedView): SavedView[] {
  if (!list.some((v) => v.id === view.id)) return [...list, view]
  return list.map((v) => (v.id === view.id ? view : v))
}

/**
 * Saved views for a project: shared ones live in `bd kv`, personal ones in
 * localStorage. Shared views come first in the merged list.
 */
export function useSavedViews(project: string) {
  const queryClient = useQueryClient()
  const sharedQuery = useQuery({
    queryKey: ['views-shared', project],
    queryFn: async () =>
      parseViews(
        (await kvGetFn({ data: { project, key: VIEWS_KV_KEY } })) ?? '[]',
      ),
    enabled: Boolean(project),
    retry: false,
  })
  const personalQuery = useQuery({
    queryKey: ['views-personal', project],
    queryFn: () => readPersonalViews(project),
    enabled: Boolean(project),
    staleTime: Infinity,
  })
  const shared = sharedQuery.data ?? []
  const personal = personalQuery.data ?? []

  const save = useMutation({
    mutationFn: async ({
      view,
      previous,
      create,
    }: {
      view: SavedView
      previous?: SavedView
      /** New view: the id is derived here, against the freshly read lists. */
      create?: boolean
    }): Promise<SavedView> => {
      const leavingShared = Boolean(previous?.shared) && !view.shared
      const writesShared = view.shared || leavingShared
      // Re-read so a concurrent edit from another client is not overwritten.
      const current =
        writesShared || create
          ? parseViews(
              (await kvGetFn({ data: { project, key: VIEWS_KV_KEY } })) ?? '[]',
            )
          : []
      const final = create
        ? {
            ...view,
            id: newViewId(view.name, [
              ...current.map((v) => v.id),
              ...readPersonalViews(project).map((v) => v.id),
            ]),
          }
        : view
      if (writesShared) {
        const base = leavingShared
          ? current.filter((v) => v.id !== final.id)
          : current
        const next = final.shared ? upsertView(base, final) : base
        await kvSetFn({
          data: { project, key: VIEWS_KV_KEY, value: JSON.stringify(next) },
        })
      }
      if (!final.shared) {
        window.localStorage.setItem(
          personalViewsKey(project),
          JSON.stringify(upsertView(readPersonalViews(project), final)),
        )
      } else if (previous && !previous.shared) {
        window.localStorage.setItem(
          personalViewsKey(project),
          JSON.stringify(
            readPersonalViews(project).filter((v) => v.id !== final.id),
          ),
        )
      }
      return final
    },
    onSuccess: () => {
      void queryClient.invalidateQueries({
        queryKey: ['views-shared', project],
      })
      void queryClient.invalidateQueries({
        queryKey: ['views-personal', project],
      })
    },
    onError: (error) =>
      toast.error(toErrorMessage(error, 'Could not save views.')),
  })

  const remove = useMutation({
    mutationFn: async (view: SavedView) => {
      if (view.shared) {
        const current = parseViews(
          (await kvGetFn({ data: { project, key: VIEWS_KV_KEY } })) ?? '[]',
        )
        await kvSetFn({
          data: {
            project,
            key: VIEWS_KV_KEY,
            value: JSON.stringify(current.filter((v) => v.id !== view.id)),
          },
        })
      } else {
        window.localStorage.setItem(
          personalViewsKey(project),
          JSON.stringify(
            readPersonalViews(project).filter((v) => v.id !== view.id),
          ),
        )
      }
    },
    onSuccess: () => {
      void queryClient.invalidateQueries({
        queryKey: ['views-shared', project],
      })
      void queryClient.invalidateQueries({
        queryKey: ['views-personal', project],
      })
    },
    onError: (error) =>
      toast.error(toErrorMessage(error, 'Could not delete the view.')),
  })

  return {
    views: mergeViews(shared, personal),
    isLoading: sharedQuery.isPending,
    sharedError: sharedQuery.isError
      ? toErrorMessage(sharedQuery.error, 'Could not load shared views.')
      : null,
    save,
    remove,
  }
}

interface ViewEditorProps {
  project: string
  /** Pre-filled values, e.g. when duplicating a view. */
  base?: SavedView
  onSaved: (view: SavedView) => void
  onOpenChange: (open: boolean) => void
}

/** Creates a view from a name and a bd query, shared with the project or personal. */
export function ViewEditor({
  project,
  base,
  onSaved,
  onOpenChange,
}: ViewEditorProps) {
  const { save } = useSavedViews(project)
  const [name, setName] = useState(base?.name ?? '')
  const [query, setQuery] = useState(base?.query ?? '')
  const [shared, setShared] = useState(base?.shared ?? false)
  const [error, setError] = useState<string | null>(null)

  async function submit() {
    const trimmed = name.trim()
    if (!trimmed) {
      setError('Name is required.')
      return
    }
    if (trimmed.length > VIEW_NAME_MAX_LENGTH) {
      setError(`Name must be ${VIEW_NAME_MAX_LENGTH} characters or fewer.`)
      return
    }
    const queryProblem = queryTextError(query)
    if (queryProblem) {
      setError(queryProblem)
      return
    }
    const view: SavedView = {
      id: '',
      name: trimmed,
      query: query.trim(),
      shared,
      ...(base?.groupBy ? { groupBy: base.groupBy } : {}),
      ...(base?.sort ? { sort: base.sort } : {}),
    }
    try {
      await validateQueryFn({ data: { project, query: view.query } })
    } catch (err) {
      setError(toErrorMessage(err, 'bd could not parse this query.'))
      return
    }
    try {
      const created = await save.mutateAsync({ view, create: true })
      onSaved(created)
      onOpenChange(false)
    } catch {
      // onError already surfaced the message.
    }
  }

  return (
    <Dialog open onOpenChange={onOpenChange}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>{base ? 'Duplicate view' : 'New view'}</DialogTitle>
          <DialogDescription>
            A view is a bd query shown as status columns.
          </DialogDescription>
        </DialogHeader>
        <form
          className="flex flex-col gap-3"
          onSubmit={(event) => {
            event.preventDefault()
            void submit()
          }}
        >
          <div className="flex flex-col gap-1.5">
            <Label htmlFor="view-name">Name</Label>
            <Input
              id="view-name"
              value={name}
              onChange={(event) => setName(event.target.value)}
              maxLength={VIEW_NAME_MAX_LENGTH}
            />
          </div>
          <div className="flex flex-col gap-1.5">
            <Label htmlFor="view-query">Query</Label>
            <Input
              id="view-query"
              className="font-mono"
              placeholder="type=bug AND priority<=1"
              value={query}
              onChange={(event) => setQuery(event.target.value)}
            />
          </div>
          <label className="flex items-center gap-2 text-sm">
            <input
              type="checkbox"
              checked={shared}
              onChange={(event) => setShared(event.target.checked)}
            />
            Share with the project (saved in bd kv)
          </label>
          {error ? (
            <p role="alert" className="text-sm text-destructive">
              {error}
            </p>
          ) : null}
          <div className="flex justify-end gap-2">
            <Button
              type="button"
              variant="ghost"
              onClick={() => onOpenChange(false)}
            >
              Cancel
            </Button>
            <Button type="submit" disabled={save.isPending}>
              Create view
            </Button>
          </div>
        </form>
      </DialogContent>
    </Dialog>
  )
}

interface ViewPageProps {
  project: string
  viewId: string | undefined
  onOpen: (bead: Bead) => void
  onCreated: (view: SavedView) => void
  onDeleted: () => void
}

/** A saved view: its bd query rendered as status columns, with inline query editing. */
export function ViewPage({
  project,
  viewId,
  onOpen,
  onCreated,
  onDeleted,
}: ViewPageProps) {
  const { views, isLoading, sharedError, save, remove } = useSavedViews(project)
  const view = views.find((v) => v.id === viewId)
  const [editing, setEditing] = useState(false)
  const [draft, setDraft] = useState<string | null>(null)
  const [saveError, setSaveError] = useState<string | null>(null)
  const [groupDraft, setGroupDraft] = useState<ViewGroupBy | null>(null)
  const [sortDraft, setSortDraft] = useState<SortKey | null>(null)
  const [duplicating, setDuplicating] = useState(false)
  const [deleting, setDeleting] = useState(false)

  // Shares the board's beads cache; a refetch there re-runs the view's query.
  const liveBeads = useQuery({
    queryKey: ['beads', project],
    queryFn: () => getBeads({ data: { project } }),
    enabled: Boolean(project),
    staleTime: 3000,
    retry: false,
  })
  const beadsQuery = useQuery({
    queryKey: ['view-beads', project, view?.query],
    queryFn: () => queryBeadsFn({ data: { project, query: view!.query } }),
    enabled: Boolean(view) && queryTextError(view?.query ?? '') === null,
    placeholderData: keepPreviousData,
    retry: false,
  })
  const refetchBeads = beadsQuery.refetch
  const seenUpdate = useRef(liveBeads.dataUpdatedAt)
  useEffect(() => {
    if (seenUpdate.current === liveBeads.dataUpdatedAt) return
    seenUpdate.current = liveBeads.dataUpdatedAt
    if (view) void refetchBeads()
  }, [liveBeads.dataUpdatedAt, refetchBeads, view])

  if (isLoading) {
    return <p className="text-sm text-muted-foreground">Loading views…</p>
  }
  if (!view) {
    return (
      <p
        role={sharedError ? 'alert' : undefined}
        className={cn(
          'text-sm',
          sharedError ? 'text-destructive' : 'text-muted-foreground',
        )}
      >
        {sharedError ?? 'This view no longer exists.'}
      </p>
    )
  }

  const draftQuery = draft ?? view.query
  const problem = draft === null ? null : queryTextError(draft)
  const groupBy = groupDraft ?? view.groupBy ?? DEFAULT_VIEW_GROUP
  const sort = sortDraft ?? view.sort ?? DEFAULT_VIEW_SORT
  const dirty =
    (draft !== null && draft.trim() !== view.query) ||
    groupBy !== (view.groupBy ?? DEFAULT_VIEW_GROUP) ||
    sort !== (view.sort ?? DEFAULT_VIEW_SORT)

  function resetDraft() {
    setDraft(null)
    setGroupDraft(null)
    setSortDraft(null)
    setSaveError(null)
    setEditing(false)
  }

  async function saveQuery() {
    if (problem) return
    try {
      await validateQueryFn({ data: { project, query: draftQuery.trim() } })
    } catch (err) {
      setSaveError(toErrorMessage(err, 'bd could not parse this query.'))
      return
    }
    setSaveError(null)
    try {
      await save.mutateAsync({
        view: { ...view!, query: draftQuery.trim(), groupBy, sort },
        previous: view,
      })
      resetDraft()
    } catch {
      // onError already surfaced the message.
    }
  }

  const beads = [...(beadsQuery.data ?? [])].sort(compareBeads(sort))
  const titleById = new Map(
    (liveBeads.data ?? []).map((b) => [b.id, b.title] as const),
  )
  const groups = buildGroups(beads, groupBy, titleById)

  return (
    <div className="flex min-h-0 flex-1 flex-col gap-3">
      <div className="flex items-start justify-between gap-4">
        <div className="min-w-0">
          <h1 className="truncate text-lg font-semibold">{view.name}</h1>
          <p className="text-sm text-muted-foreground">
            {view.shared
              ? 'shared with the project · saved in bd kv'
              : 'personal'}
          </p>
        </div>
        <div className="flex shrink-0 gap-2">
          <Button variant="ghost" onClick={() => setDuplicating(true)}>
            Duplicate
          </Button>
          {editing ? (
            <>
              <Button variant="ghost" onClick={resetDraft}>
                Cancel
              </Button>
              <Button variant="ghost" onClick={() => setDeleting(true)}>
                Delete
              </Button>
            </>
          ) : (
            <Button
              variant="outline"
              onClick={() => {
                setDraft(view.query)
                setEditing(true)
              }}
            >
              Edit view
            </Button>
          )}
          {dirty ? (
            <Button
              onClick={() => void saveQuery()}
              disabled={Boolean(problem) || save.isPending}
            >
              Save view
            </Button>
          ) : null}
        </div>
      </div>

      {editing ? (
        <div className="flex flex-col gap-1">
          <div className="flex items-center gap-2 font-mono text-sm">
            <span className="shrink-0 text-faint" aria-hidden="true">
              $ bd query
            </span>
            <Input
              aria-label="View query"
              className="font-mono"
              value={draftQuery}
              onChange={(event) => setDraft(event.target.value)}
            />
          </div>
          {problem || saveError ? (
            <p role="alert" className="text-sm text-destructive">
              {problem ?? saveError}
            </p>
          ) : null}
        </div>
      ) : (
        <code className="block rounded-md border border-border px-3 py-2 font-mono text-sm">
          <span className="text-faint">$ bd query </span>
          &quot;{view.query}&quot;
        </code>
      )}

      {beadsQuery.isError ? (
        <p role="alert" className="text-sm text-destructive">
          {toErrorMessage(beadsQuery.error, 'Query failed.')}
        </p>
      ) : null}

      <div className="flex flex-wrap items-center gap-x-4 gap-y-1 text-sm text-muted-foreground">
        <div className="flex items-center gap-1.5">
          Group by
          {editing ? (
            <Select
              value={groupBy}
              onValueChange={(value) =>
                setGroupDraft(parseViewGroup(value) ?? DEFAULT_VIEW_GROUP)
              }
            >
              <SelectTrigger size="sm" aria-label="Group by">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {VIEW_GROUP_OPTIONS.map((o) => (
                  <SelectItem key={o.key} value={o.key}>
                    {o.label}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          ) : (
            <span className="text-foreground">
              {VIEW_GROUP_OPTIONS.find((o) => o.key === groupBy)?.label}
            </span>
          )}
        </div>
        <div className="flex items-center gap-1.5">
          Sort
          {editing ? (
            <Select
              value={sort}
              onValueChange={(value) =>
                setSortDraft(parseViewSort(value) ?? DEFAULT_VIEW_SORT)
              }
            >
              <SelectTrigger size="sm" aria-label="Sort">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {SORT_OPTIONS.map((o) => (
                  <SelectItem key={o.key} value={o.key}>
                    {o.label}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          ) : (
            <span className="text-foreground">
              {SORT_OPTIONS.find((o) => o.key === sort)?.label}
            </span>
          )}
        </div>
        <span>
          Show{' '}
          <span className="text-foreground">ID · priority · labels · due</span>
        </span>
      </div>

      <div className="flex min-h-0 flex-1 flex-col gap-4 overflow-y-auto">
        {groups.map((group) => (
          <section
            key={group.key}
            className={cn(
              'flex min-h-0 flex-col gap-2',
              group.label ? 'h-80 shrink-0' : 'flex-1',
            )}
          >
            {group.label ? (
              <h2 className="text-sm font-medium">
                {group.label}{' '}
                <span className="font-mono text-xs text-faint">
                  {group.beads.length}
                </span>
              </h2>
            ) : null}
            <div className="grid min-h-0 flex-1 grid-cols-1 gap-3 md:grid-cols-2 xl:grid-cols-4">
              {COLUMNS.map((c) => (
                <KanbanColumn
                  key={c.key}
                  column={c.key}
                  label={c.label}
                  beads={group.beads.filter(
                    (b) => mapStatus(b).column === c.key,
                  )}
                  onOpen={onOpen}
                />
              ))}
            </div>
          </section>
        ))}
      </div>

      <Dialog open={deleting} onOpenChange={setDeleting}>
        <DialogContent className="sm:max-w-[400px]">
          <DialogHeader>
            <DialogTitle>Delete view</DialogTitle>
            <DialogDescription>
              Delete “{view.name}”?{' '}
              {view.shared
                ? 'It is shared with the project and will be removed for everyone.'
                : 'This cannot be undone.'}
            </DialogDescription>
          </DialogHeader>
          <div className="flex justify-end gap-2">
            <Button variant="ghost" onClick={() => setDeleting(false)}>
              Cancel
            </Button>
            <Button
              variant="destructive"
              disabled={remove.isPending}
              onClick={() => {
                remove.mutate(view, {
                  onSuccess: () => {
                    setDeleting(false)
                    onDeleted()
                  },
                })
              }}
            >
              Delete view
            </Button>
          </div>
        </DialogContent>
      </Dialog>

      {duplicating ? (
        <ViewEditor
          project={project}
          base={{ ...view, name: `${view.name} copy`, shared: false }}
          onSaved={onCreated}
          onOpenChange={setDuplicating}
        />
      ) : null}
    </div>
  )
}

interface ViewGroup {
  key: string
  /** Null for the single ungrouped (status) group. */
  label: string | null
  beads: Bead[]
}

/** Status grouping is the column grid itself; priority and epic add a heading per group. */
function buildGroups(
  beads: Bead[],
  groupBy: ViewGroupBy,
  titleById: Map<string, string>,
): ViewGroup[] {
  if (groupBy === 'status') return [{ key: 'all', label: null, beads }]
  const groups = new Map<string, ViewGroup>()
  for (const b of beads) {
    const key =
      groupBy === 'priority' ? `p${Math.max(0, b.priority)}` : (b.parent ?? '')
    let group = groups.get(key)
    if (!group) {
      const label =
        groupBy === 'priority'
          ? priorityLabel(b.priority)
          : b.parent
            ? `${b.parent} · ${titleById.get(b.parent) ?? 'epic'}`
            : 'No epic'
      group = { key, label, beads: [] }
      groups.set(key, group)
    }
    group.beads.push(b)
  }
  return [...groups.values()].sort((a, b) => a.key.localeCompare(b.key))
}
