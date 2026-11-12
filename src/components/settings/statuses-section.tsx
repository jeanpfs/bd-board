import { useState } from 'react'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { toast } from 'sonner'

import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'
import {
  BUILT_IN_CATEGORY,
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
import { cn } from '@/lib/utils'
import type { StatusCategory } from '@/lib/types'

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

/** Neutral dot for active and frozen; colour only for wip and done, always with a label. */
function categoryDotClass(category: StatusCategory): string {
  if (category === 'wip') return 'bg-status-progress'
  if (category === 'done') return 'bg-status-closed'
  return 'bg-muted-foreground'
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
  const dirty = value !== serializeCustomStatuses(parseCustomStatuses(saved))
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
        {Object.entries(BUILT_IN_CATEGORY).map(([builtIn, builtInCategory]) => (
          <div
            key={builtIn}
            className="grid grid-cols-[1fr_140px_80px_72px] items-center gap-3 border-b border-border px-4 py-2"
          >
            <span className="font-mono text-body text-foreground">
              {builtIn}
            </span>
            <span className="flex items-center gap-2 text-body text-foreground">
              <span
                aria-hidden="true"
                className={cn(
                  'size-2 rounded-full',
                  categoryDotClass(builtInCategory),
                )}
              />
              {builtInCategory}
            </span>
            <span className="text-right font-mono text-body text-muted-foreground">
              {beadCounts.get(builtIn) ?? 0}
            </span>
            <span className="text-right text-xs text-muted-foreground">
              built-in
            </span>
          </div>
        ))}
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
                className={cn(
                  'size-2 rounded-full',
                  categoryDotClass(row.category),
                )}
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
            <Label htmlFor="new-status-name" className="sr-only">
              New status name
            </Label>
            <Input
              id="new-status-name"
              placeholder="status_name"
              value={name}
              onChange={(event) => setName(event.target.value)}
              className="font-mono"
            />
            {addProblem ? (
              <span className="text-xs text-destructive">{addProblem}</span>
            ) : null}
          </div>
          <Select
            value={category}
            onValueChange={(next) => setCategory(next as CustomStatusCategory)}
          >
            <SelectTrigger
              aria-label="New status category"
              className="w-[140px]"
            >
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {CUSTOM_STATUS_CATEGORIES.map((option) => (
                <SelectItem key={option} value={option}>
                  {option}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
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
          variant="outline"
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
