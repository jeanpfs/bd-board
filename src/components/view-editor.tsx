import { useState } from 'react'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
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
import { Label } from '@/components/ui/label'
import { getBeads, kvGetFn, kvSetFn, queryBeadsFn } from '@/lib/server'
import {
  VIEWS_KV_KEY,
  VIEW_NAME_MAX_LENGTH,
  mergeViews,
  newViewId,
  parseViews,
  personalViewsKey,
  queryTextError,
} from '@/lib/views'
import type { SavedView } from '@/lib/views'
import { COLUMNS, mapStatus } from '@/lib/types'
import type { Bead } from '@/lib/types'
import { toErrorMessage } from '@/lib/utils'

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
    }: {
      view: SavedView
      previous?: SavedView
    }) => {
      const leavingShared = Boolean(previous?.shared) && !view.shared
      if (view.shared || leavingShared) {
        // Re-read so a concurrent edit from another client is not overwritten.
        const current = parseViews(
          (await kvGetFn({ data: { project, key: VIEWS_KV_KEY } })) ?? '[]',
        )
        const base = leavingShared
          ? current.filter((v) => v.id !== view.id)
          : current
        const next = view.shared ? upsertView(base, view) : base
        await kvSetFn({
          data: { project, key: VIEWS_KV_KEY, value: JSON.stringify(next) },
        })
      }
      if (!view.shared) {
        window.localStorage.setItem(
          personalViewsKey(project),
          JSON.stringify(upsertView(readPersonalViews(project), view)),
        )
      } else if (previous && !previous.shared) {
        window.localStorage.setItem(
          personalViewsKey(project),
          JSON.stringify(
            readPersonalViews(project).filter((v) => v.id !== view.id),
          ),
        )
      }
    },
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: ['views-shared', project] })
      void queryClient.invalidateQueries({
        queryKey: ['views-personal', project],
      })
    },
    onError: (error) => toast.error(toErrorMessage(error)),
  })

  return {
    views: mergeViews(shared, personal),
    isLoading: sharedQuery.isPending,
    save,
  }
}

interface ViewEditorProps {
  project: string
  existing: SavedView[]
  /** Pre-filled values, e.g. when duplicating a view. */
  base?: SavedView
  onSaved: (view: SavedView) => void
  onOpenChange: (open: boolean) => void
}

/** Creates a view from a name and a bd query, shared with the project or personal. */
export function ViewEditor({
  project,
  existing,
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
      id: newViewId(trimmed, existing.map((v) => v.id)),
      name: trimmed,
      query: query.trim(),
      shared,
    }
    try {
      await save.mutateAsync({ view })
      onSaved(view)
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
}

/** A saved view: its bd query rendered as status columns, with inline query editing. */
export function ViewPage({ project, viewId, onOpen, onCreated }: ViewPageProps) {
  const { views, isLoading, save } = useSavedViews(project)
  const view = views.find((v) => v.id === viewId)
  const [editing, setEditing] = useState(false)
  const [draft, setDraft] = useState<string | null>(null)
  const [duplicating, setDuplicating] = useState(false)

  // Shares the board's beads cache; a refetch there re-runs the view's query.
  const liveBeads = useQuery({
    queryKey: ['beads', project],
    queryFn: () => getBeads({ data: { project } }),
    enabled: Boolean(project),
    staleTime: 3000,
    retry: false,
  })
  const beadsQuery = useQuery({
    queryKey: ['view-beads', project, view?.query, liveBeads.dataUpdatedAt],
    queryFn: () => queryBeadsFn({ data: { project, query: view!.query } }),
    enabled: Boolean(view) && queryTextError(view?.query ?? '') === null,
    retry: false,
  })

  if (isLoading) {
    return <p className="text-sm text-muted-foreground">Loading views…</p>
  }
  if (!view) {
    return (
      <p className="text-sm text-muted-foreground">
        This view no longer exists.
      </p>
    )
  }

  const draftQuery = draft ?? view.query
  const problem = draft === null ? null : queryTextError(draft)
  const dirty = draft !== null && draft.trim() !== view.query

  async function saveQuery() {
    if (draft === null || problem) return
    try {
      await save.mutateAsync({
        view: { ...view!, query: draft.trim() },
        previous: view,
      })
      setDraft(null)
      setEditing(false)
    } catch {
      // onError already surfaced the message.
    }
  }

  const beads = beadsQuery.data ?? []

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
            <Button
              variant="ghost"
              onClick={() => {
                setDraft(null)
                setEditing(false)
              }}
            >
              Cancel
            </Button>
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
          <Input
            aria-label="View query"
            className="font-mono"
            value={draftQuery}
            onChange={(event) => setDraft(event.target.value)}
          />
          {problem ? (
            <p role="alert" className="text-sm text-destructive">
              {problem}
            </p>
          ) : null}
        </div>
      ) : (
        <code className="block rounded-md border border-border px-3 py-2 font-mono text-sm">
          {view.query}
        </code>
      )}

      {beadsQuery.isError ? (
        <p role="alert" className="text-sm text-destructive">
          {toErrorMessage(beadsQuery.error)}
        </p>
      ) : null}

      <div className="grid min-h-0 flex-1 grid-cols-1 gap-3 md:grid-cols-2 xl:grid-cols-4">
        {COLUMNS.map((c) => (
          <KanbanColumn
            key={c.key}
            column={c.key}
            label={c.label}
            beads={beads.filter((b) => mapStatus(b).column === c.key)}
            onOpen={onOpen}
          />
        ))}
      </div>

      {duplicating ? (
        <ViewEditor
          project={project}
          existing={views}
          base={{ ...view, name: `${view.name} copy`, shared: false }}
          onSaved={onCreated}
          onOpenChange={setDuplicating}
        />
      ) : null}
    </div>
  )
}
