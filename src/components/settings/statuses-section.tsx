import { useState } from 'react'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { toast } from 'sonner'

import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import {
  CUSTOM_STATUS_CATEGORIES,
  parseCustomStatuses,
  serializeCustomStatuses,
  validateCustomStatusList,
  validateStatusName,
} from '@/lib/custom-statuses'
import type {
  CustomStatusCategory,
  CustomStatusRow,
} from '@/lib/custom-statuses'
import { getBeads, getConfigFn, setConfigFn } from '@/lib/server'

interface StatusesSectionProps {
  project: string
}

/** Custom statuses: the `status.custom` value, edited as rows and saved whole. */
export function StatusesSection({ project }: StatusesSectionProps) {
  const configQuery = useQuery({
    queryKey: ['config', project, 'status.custom'],
    queryFn: () => getConfigFn({ data: { project, key: 'status.custom' } }),
    retry: false,
  })
  const beadsQuery = useQuery({
    queryKey: ['beads', project],
    queryFn: () => getBeads({ data: { project } }),
    staleTime: 3000,
    retry: false,
  })

  if (configQuery.isPending) {
    return <p className="text-body text-muted-foreground">Loading statuses…</p>
  }
  if (configQuery.isError) {
    return (
      <p className="text-body text-destructive">
        Could not read the custom statuses.
      </p>
    )
  }
  return (
    <StatusesEditor
      key={configQuery.data}
      project={project}
      saved={configQuery.data}
      beadCounts={countByStatus(beadsQuery.data ?? [])}
    />
  )
}

function countByStatus(beads: { status: string }[]): Map<string, number> {
  const counts = new Map<string, number>()
  for (const bead of beads) {
    counts.set(bead.status, (counts.get(bead.status) ?? 0) + 1)
  }
  return counts
}

interface StatusesEditorProps {
  project: string
  saved: string
  beadCounts: Map<string, number>
}

function StatusesEditor({ project, saved, beadCounts }: StatusesEditorProps) {
  const queryClient = useQueryClient()
  const [rows, setRows] = useState<CustomStatusRow[]>(() =>
    parseCustomStatuses(saved),
  )
  const [name, setName] = useState('')
  const [category, setCategory] = useState<CustomStatusCategory>('wip')
  const [error, setError] = useState<string | null>(null)

  const value = serializeCustomStatuses(rows)
  const dirty = value !== saved
  const addProblem =
    name.trim() === ''
      ? null
      : validateStatusName(
          name.trim(),
          rows.map((row) => row.name),
        )

  const save = useMutation({
    mutationFn: () =>
      setConfigFn({ data: { project, key: 'status.custom', value } }),
    onSuccess: () => {
      setError(null)
      queryClient.invalidateQueries({
        queryKey: ['config', project, 'status.custom'],
      })
      queryClient.invalidateQueries({ queryKey: ['beads', project] })
      queryClient.invalidateQueries({ queryKey: ['projects'] })
      toast.success('Statuses saved')
    },
    onError: (err) =>
      setError(err instanceof Error ? err.message : String(err)),
  })

  function addRow() {
    const trimmed = name.trim()
    if (trimmed === '' || addProblem) return
    setRows([...rows, { name: trimmed, category }])
    setName('')
    setError(null)
  }

  function saveRows() {
    const problem = validateCustomStatusList(value)
    if (problem) {
      setError(problem)
      return
    }
    save.mutate()
  }

  return (
    <div className="flex flex-col gap-5">
      <div className="flex flex-col gap-1">
        <h2 className="text-title font-semibold text-foreground">Statuses</h2>
        <p className="text-body text-muted-foreground">
          Custom statuses extend the built-in ones. Each one is filed under a
          board category, which decides its column.
        </p>
      </div>

      <div className="flex flex-col rounded-lg border border-border">
        <div className="grid grid-cols-[1fr_140px_80px_72px] gap-3 border-b border-border px-4 py-2 text-badge font-medium text-faint">
          <span>Status</span>
          <span>Category</span>
          <span className="text-right">Beads</span>
          <span className="sr-only">Actions</span>
        </div>
        {rows.length === 0 ? (
          <p className="px-4 py-3 text-body text-muted-foreground">
            No custom statuses yet.
          </p>
        ) : null}
        {rows.map((row) => (
          <div
            key={row.name}
            className="grid grid-cols-[1fr_140px_80px_72px] items-center gap-3 border-b border-border px-4 py-2 last:border-b-0"
          >
            <span className="font-mono text-body text-foreground">
              {row.name}
            </span>
            <span className="flex items-center gap-2 text-body text-foreground">
              <span
                aria-hidden="true"
                className="size-2 rounded-full bg-muted-foreground"
              />
              {row.category}
            </span>
            <span className="text-right font-mono text-body text-muted-foreground">
              {beadCounts.get(row.name) ?? 0}
            </span>
            <span className="text-right">
              <Button
                type="button"
                variant="ghost"
                size="sm"
                aria-label={`Remove ${row.name}`}
                onClick={() => setRows(rows.filter((r) => r !== row))}
              >
                Remove
              </Button>
            </span>
          </div>
        ))}
        <div className="flex items-start gap-3 border-t border-border px-4 py-3">
          <div className="flex min-w-0 flex-1 flex-col gap-1">
            <Input
              aria-label="New status name"
              placeholder="status_name"
              value={name}
              onChange={(event) => setName(event.target.value)}
              className="font-mono"
            />
            {addProblem ? (
              <span className="text-xs text-destructive">{addProblem}</span>
            ) : null}
          </div>
          <select
            aria-label="New status category"
            value={category}
            onChange={(event) =>
              setCategory(event.target.value as CustomStatusCategory)
            }
            className="h-9 rounded-md border border-border bg-transparent px-2 text-body text-foreground"
          >
            {CUSTOM_STATUS_CATEGORIES.map((option) => (
              <option key={option} value={option}>
                {option}
              </option>
            ))}
          </select>
          <Button
            type="button"
            variant="outline"
            onClick={addRow}
            disabled={name.trim() === '' || addProblem !== null}
          >
            Add status
          </Button>
        </div>
      </div>

      <p className="rounded-md bg-white/5 px-3 py-2 font-mono text-xs text-muted-foreground">
        $ bd config set status.custom &quot;{value}&quot;
      </p>

      {error ? <p className="text-body text-destructive">{error}</p> : null}

      <div className="flex items-center justify-end gap-2">
        <Button
          type="button"
          variant="ghost"
          disabled={!dirty || save.isPending}
          onClick={() => {
            setRows(parseCustomStatuses(saved))
            setError(null)
          }}
        >
          Discard
        </Button>
        <Button
          type="button"
          disabled={!dirty || save.isPending}
          onClick={saveRows}
        >
          Save changes
        </Button>
      </div>
    </div>
  )
}
