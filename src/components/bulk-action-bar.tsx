import { useState } from 'react'
import { useMutation, useQueryClient } from '@tanstack/react-query'
import { CheckCircle2, ChevronDown, Loader2, X } from 'lucide-react'
import { toast } from 'sonner'

import { LabelsInput } from '@/components/labels-input'
import { Button } from '@/components/ui/button'
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu'
import { Input } from '@/components/ui/input'
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from '@/components/ui/popover'
import { quickDue } from '@/lib/schedule'
import type { LabelCount } from '@/lib/labels'
import { updateManyFn } from '@/lib/server'
import { PRIORITIES, PRIORITY_WORD, priorityLabel } from '@/lib/sort'
import type { BulkPatch } from '@/lib/types'
import { toErrorMessage } from '@/lib/utils'

const STATUS_OPTIONS: { value: string; label: string }[] = [
  { value: 'open', label: 'Open' },
  { value: 'in_progress', label: 'In progress' },
  { value: 'blocked', label: 'Blocked' },
]

/**
 * Actions for the selected list rows. Every patch goes to one `bd update`
 * over all selected ids; closing hands off to the close dialog via `onClose`.
 */
export function BulkActionBar({
  project,
  ids,
  labelCounts,
  onClear,
  onClose,
}: {
  project: string
  ids: string[]
  labelCounts: LabelCount[]
  onClear: () => void
  onClose: () => void
}) {
  const queryClient = useQueryClient()
  const [assignee, setAssignee] = useState('')
  const [pendingLabels, setPendingLabels] = useState<string[]>([])
  const [assignOpen, setAssignOpen] = useState(false)
  const [labelsOpen, setLabelsOpen] = useState(false)
  const [dueOpen, setDueOpen] = useState(false)

  const noun = ids.length === 1 ? 'bead' : 'beads'

  const mutation = useMutation({
    mutationFn: (patch: BulkPatch) =>
      updateManyFn({ data: { project, ids, patch } }),
    onSuccess: () => {
      toast.success(`Updated ${ids.length} ${noun}`)
      queryClient.invalidateQueries({ queryKey: ['beads', project] })
      queryClient.invalidateQueries({ queryKey: ['projects'] })
    },
    onError: (error) => {
      toast.error(toErrorMessage(error, 'Bulk update failed'))
    },
  })

  const busy = mutation.isPending
  const now = new Date()

  function apply(patch: BulkPatch, done?: () => void) {
    mutation.mutate(patch, { onSuccess: () => done?.() })
  }

  return (
    <div
      role="toolbar"
      aria-label="Bulk actions"
      className="flex flex-wrap items-center gap-2 rounded-lg bg-card px-3 py-2 shadow-md ring-1 ring-border"
    >
      <span className="text-sm font-medium tabular-nums">
        {ids.length} selected
      </span>
      <Button size="sm" variant="ghost" onClick={onClear}>
        <X className="size-3.5" aria-hidden="true" />
        Clear
      </Button>

      <div className="mx-1 h-5 w-px bg-border" aria-hidden="true" />

      <DropdownMenu>
        <DropdownMenuTrigger asChild>
          <Button size="sm" variant="outline" disabled={busy}>
            Status
            <ChevronDown className="size-3.5" aria-hidden="true" />
          </Button>
        </DropdownMenuTrigger>
        <DropdownMenuContent align="start">
          {STATUS_OPTIONS.map((option) => (
            <DropdownMenuItem
              key={option.value}
              onClick={() => apply({ status: option.value })}
            >
              {option.label}
            </DropdownMenuItem>
          ))}
        </DropdownMenuContent>
      </DropdownMenu>

      <DropdownMenu>
        <DropdownMenuTrigger asChild>
          <Button size="sm" variant="outline" disabled={busy}>
            Priority
            <ChevronDown className="size-3.5" aria-hidden="true" />
          </Button>
        </DropdownMenuTrigger>
        <DropdownMenuContent align="start">
          {PRIORITIES.map((p) => (
            <DropdownMenuItem key={p} onClick={() => apply({ priority: p })}>
              {priorityLabel(p)} · {PRIORITY_WORD[p]}
            </DropdownMenuItem>
          ))}
        </DropdownMenuContent>
      </DropdownMenu>

      <Popover open={assignOpen} onOpenChange={setAssignOpen}>
        <PopoverTrigger asChild>
          <Button size="sm" variant="outline" disabled={busy}>
            Assign
          </Button>
        </PopoverTrigger>
        <PopoverContent align="start" className="w-64 gap-2">
          <Input
            aria-label="Assignee"
            value={assignee}
            onChange={(event) => setAssignee(event.target.value)}
            placeholder="Assignee"
            autoFocus
          />
          <div className="flex justify-end gap-2">
            <Button
              size="sm"
              variant="ghost"
              disabled={busy}
              onClick={() =>
                apply({ assignee: '' }, () => setAssignOpen(false))
              }
            >
              Unassign
            </Button>
            <Button
              size="sm"
              disabled={busy || !assignee.trim()}
              onClick={() =>
                apply({ assignee: assignee.trim() }, () => setAssignOpen(false))
              }
            >
              Assign
            </Button>
          </div>
        </PopoverContent>
      </Popover>

      <Popover
        open={labelsOpen}
        onOpenChange={(next) => {
          setLabelsOpen(next)
          if (!next) setPendingLabels([])
        }}
      >
        <PopoverTrigger asChild>
          <Button size="sm" variant="outline" disabled={busy}>
            Add label
          </Button>
        </PopoverTrigger>
        <PopoverContent align="start" className="w-72 gap-2">
          <LabelsInput
            value={pendingLabels}
            onChange={setPendingLabels}
            counts={labelCounts}
          />
          <div className="flex justify-end">
            <Button
              size="sm"
              disabled={busy || pendingLabels.length === 0}
              onClick={() =>
                apply({ addLabels: pendingLabels }, () => setLabelsOpen(false))
              }
            >
              Add to {ids.length}
            </Button>
          </div>
        </PopoverContent>
      </Popover>

      <Popover open={dueOpen} onOpenChange={setDueOpen}>
        <PopoverTrigger asChild>
          <Button size="sm" variant="outline" disabled={busy}>
            Due
          </Button>
        </PopoverTrigger>
        <PopoverContent align="start" className="w-48 gap-1">
          {quickDue(now).map((option) => (
            <Button
              key={option.label}
              size="sm"
              variant="ghost"
              className="justify-between"
              disabled={busy}
              onClick={() =>
                apply({ due: option.value }, () => setDueOpen(false))
              }
            >
              {option.label}
              <span className="font-mono text-xs text-muted-foreground">
                {option.hint}
              </span>
            </Button>
          ))}
          <Button
            size="sm"
            variant="ghost"
            disabled={busy}
            onClick={() => apply({ due: '' }, () => setDueOpen(false))}
          >
            Clear due date
          </Button>
        </PopoverContent>
      </Popover>

      <div className="mx-1 h-5 w-px bg-border" aria-hidden="true" />

      <Button size="sm" variant="destructive" disabled={busy} onClick={onClose}>
        {busy ? (
          <Loader2 className="size-3.5 animate-spin" aria-hidden="true" />
        ) : (
          <CheckCircle2 className="size-3.5" aria-hidden="true" />
        )}
        Close {ids.length}
      </Button>
    </div>
  )
}
