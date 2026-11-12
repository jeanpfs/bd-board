import { useEffect, useMemo, useState } from 'react'
import { format } from 'date-fns'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { relativeDate } from '@/lib/time'
import Markdown from 'react-markdown'
import {
  AlignLeft,
  AlertTriangle,
  Ban,
  BookOpen,
  ChevronRight,
  CircleCheck,
  CornerUpLeft,
  Layers,
  Link2,
  ListTree,
  Loader2,
  MessageSquare,
  Pencil,
  Plus,
  Trash2,
  Waypoints,
} from 'lucide-react'
import { toast } from 'sonner'

import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog'
import { Avatar, AvatarFallback } from '@/components/ui/avatar'
import { CloseBeadDialog } from '@/components/close-bead-dialog'
import { CreateBeadDialog } from '@/components/create-bead-dialog'
import { DueDatePicker } from '@/components/due-date-picker'
import { EstimateInput } from '@/components/estimate-input'
import { SnoozeMenu } from '@/components/snooze-menu'
import { RelationsEditor } from '@/components/relations-editor'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { InteractiveRow } from '@/components/ui/interactive-row'
import { Label } from '@/components/ui/label'
import { Textarea } from '@/components/ui/textarea'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'
import { Skeleton } from '@/components/ui/skeleton'
import { LabelsInput } from '@/components/labels-input'
import { labelCounts } from '@/lib/labels'
import { cn, initials, toErrorMessage } from '@/lib/utils'
import { COLUMNS, isEpic, mapStatus } from '@/lib/types'
import { groupRelations } from '@/lib/relations'
import { beadPatchFromUpdate, patchCachedBead } from '@/lib/optimistic'
import { PRIORITY_TEXT_CLASS, PRIORITY_WORD } from '@/lib/sort'
import {
  KNOWLEDGE_TYPE_BG_CLASS as K_BG_CLASS,
  KNOWLEDGE_TYPE_DOT_CLASS as K_DOT_CLASS,
  KNOWLEDGE_TYPE_LABEL,
  KNOWLEDGE_TYPE_TEXT_CLASS as K_TEXT_CLASS,
} from '@/lib/knowledge'
import {
  addCommentFn,
  deleteBeadFn,
  getBeads,
  getBeadDetailFn,
  getProjectKnowledgeFn,
  previewDeleteBeadFn,
  updateBeadFn,
  updateBeadStatusFn,
} from '@/lib/server'

import type { LucideIcon } from 'lucide-react'
import type { FormEvent, ReactNode } from 'react'
import type { Bead, BeadColumn, BeadDetail, BeadUpdate } from '@/lib/types'

export interface BeadAction {
  id: string
  nonce: number
  /** Bead the action targets; the route drops it when a different bead opens. */
  beadId: string
}

/** Edit-dialog control a shortcut focuses; its value is the element id suffix. */
type EditField = 'priority' | 'assignee' | 'labels'
interface BeadDetailModalProps {
  project: string
  bead: Bead | null
  open: boolean
  onOpenChange: (open: boolean) => void
  onOpenBead: (bead: Bead) => void
  resolveBead: (id: string) => Bead | undefined
  onOpenKnowledge: (id: string) => void
  action?: BeadAction | null
  onActionHandled: () => void
}

const COLUMN_LABEL: Record<BeadColumn, string> = {
  open: 'Open',
  in_progress: 'In progress',
  blocked: 'Blocked',
  closed: 'Closed',
}

const BADGE_TONE: Record<'warning' | 'muted' | 'info', string> = {
  warning: 'bg-warn/16 text-warn',
  muted: 'bg-white/7 text-muted-foreground',
  info: 'bg-status-progress/18 text-status-progress',
}

const DOT_CLASS: Record<BeadColumn, string> = {
  open: 'bg-status-open',
  in_progress: 'bg-status-progress',
  blocked: 'bg-status-blocked',
  closed: 'bg-status-closed',
}

const COLUMN_TEXT: Record<BeadColumn, string> = {
  open: 'text-status-open',
  in_progress: 'text-status-progress',
  blocked: 'text-status-blocked',
  closed: 'text-status-closed',
}

const EDIT_TYPES = [
  { value: 'task', label: 'Task' },
  { value: 'bug', label: 'Bug' },
  { value: 'feature', label: 'Feature' },
  { value: 'epic', label: 'Epic' },
  { value: 'chore', label: 'Chore' },
  { value: 'decision', label: 'Decision' },
]

const PRIORITIES = [0, 1, 2, 3, 4]

function LinkedBeadList({
  items,
  resolveBead,
  onOpenBead,
}: {
  items: { id: string; note?: string }[]
  resolveBead: (id: string) => Bead | undefined
  onOpenBead: (bead: Bead) => void
}) {
  return (
    <ul className="flex flex-col gap-1.5">
      {items.map(({ id, note }) => {
        const target = resolveBead(id)
        const column = target ? mapStatus(target).column : null
        return (
          <li key={`${id}:${note ?? ''}`}>
            <InteractiveRow
              disabled={!target}
              onClick={() => {
                if (target) onOpenBead(target)
              }}
            >
              <span
                className={cn(
                  'size-2 shrink-0 rounded-full',
                  column ? DOT_CLASS[column] : 'bg-muted-foreground/30',
                )}
                aria-hidden="true"
              />
              <span className="font-mono text-badge text-muted-foreground">
                {id}
              </span>
              <span
                className={cn(
                  'truncate text-body',
                  !target && 'text-muted-foreground/60 italic',
                )}
              >
                {target?.title ?? 'Not on this board'}
              </span>
              <span className="ml-auto flex shrink-0 items-center gap-1.5">
                {target?.due_at ? (
                  <span className="text-badge text-muted-foreground">
                    due {format(new Date(target.due_at), 'MMM d')}
                  </span>
                ) : null}
                {note ? (
                  <span className="font-mono text-badge tracking-[0.05em] text-muted-foreground uppercase">
                    {note}
                  </span>
                ) : column ? (
                  <span
                    className={cn(
                      'font-mono text-badge tracking-[0.05em] uppercase',
                      COLUMN_TEXT[column],
                    )}
                  >
                    {COLUMN_LABEL[column]}
                  </span>
                ) : null}
                {target ? (
                  <ChevronRight
                    className="size-3.5 text-muted-foreground/50"
                    aria-hidden="true"
                  />
                ) : null}
              </span>
            </InteractiveRow>
          </li>
        )
      })}
    </ul>
  )
}

function SectionHeader({
  icon: Icon,
  label,
  trailing,
  actions,
}: {
  icon: LucideIcon
  label: string
  trailing?: ReactNode
  actions?: ReactNode
}) {
  return (
    <div className="mb-2.5 flex items-center gap-1.5 text-muted-foreground">
      <Icon className="size-3.5" aria-hidden="true" />
      <h3 className="font-mono text-badge font-medium tracking-[0.09em] uppercase">
        {label}
      </h3>
      {trailing != null || actions ? (
        <span className="ml-auto flex items-center gap-2">
          {trailing != null ? (
            <span className="font-mono text-badge tabular-nums text-faint">
              {trailing}
            </span>
          ) : null}
          {actions}
        </span>
      ) : null}
    </div>
  )
}

function MetaField({
  label,
  children,
}: {
  label: string
  children: ReactNode
}) {
  return (
    <div className="flex flex-col [&+&]:mt-4">
      <span className="mb-[7px] block font-mono text-badge font-medium tracking-[0.09em] text-faint uppercase">
        {label}
      </span>
      <div className="flex items-center gap-1.5 text-body text-foreground">
        {children}
      </div>
    </div>
  )
}

function BeadEditDialog({
  project,
  bead,
  detail,
  open,
  onOpenChange,
  initialField,
}: {
  project: string
  bead: Bead
  detail?: BeadDetail
  open: boolean
  onOpenChange: (open: boolean) => void
  initialField?: EditField
}) {
  const queryClient = useQueryClient()
  const [title, setTitle] = useState('')
  const [description, setDescription] = useState('')
  const [acceptance, setAcceptance] = useState('')
  const [design, setDesign] = useState('')
  const [notes, setNotes] = useState('')
  const [priority, setPriority] = useState('2')
  const [issueType, setIssueType] = useState('task')
  const [assignee, setAssignee] = useState('')
  const [labels, setLabels] = useState<string[]>([])
  const beadsQuery = useQuery({
    queryKey: ['beads', project],
    queryFn: () => getBeads({ data: { project } }),
    enabled: false,
  })
  const counts = useMemo(
    () => labelCounts(beadsQuery.data ?? []),
    [beadsQuery.data],
  )

  useEffect(() => {
    if (!open) return
    const source = detail ?? bead
    setTitle(source.title)
    setDescription(source.description ?? '')
    setAcceptance(source.acceptance_criteria ?? '')
    setDesign(source.design ?? '')
    setNotes(source.notes ?? '')
    setPriority(String(Math.max(0, Math.min(4, source.priority))))
    setIssueType(source.issue_type || 'task')
    setAssignee(source.assignee ?? '')
    setLabels(source.labels ?? [])
  }, [bead, detail, open])

  // P/A/L open the edit dialog with the matching control focused.
  useEffect(() => {
    if (!open || !initialField) return
    requestAnimationFrame(() =>
      document.getElementById(`edit-bead-${initialField}`)?.focus(),
    )
  }, [open, initialField])

  function buildUpdate(): BeadUpdate {
    // bd-native labels and types may fall outside the form's own choices,
    // so send them only when this edit changed them.
    const source = detail ?? bead
    const update: BeadUpdate = {
      title,
      description,
      acceptance_criteria: acceptance,
      design,
      notes,
      priority: Number(priority),
      assignee,
    }
    if (issueType !== (source.issue_type || 'task')) {
      update.issue_type = issueType
    }
    const sourceLabels = source.labels ?? []
    const labelsChanged =
      [...labels].sort().join('\n') !== [...sourceLabels].sort().join('\n')
    if (labelsChanged) update.labels = labels
    return update
  }

  const mutation = useMutation({
    mutationFn: (update: BeadUpdate) =>
      updateBeadFn({ data: { project, id: bead.id, update } }),
    onMutate: (update) =>
      patchCachedBead(
        queryClient,
        project,
        bead.id,
        beadPatchFromUpdate(update),
      ),
    onSuccess: () => {
      toast.success(`Bead ${bead.id} updated`)
      onOpenChange(false)
    },
    onError: (error, _update, undo) => {
      undo?.()
      toast.error(
        error instanceof Error ? error.message : 'Failed to update bead',
      )
    },
    onSettled: () => {
      queryClient.invalidateQueries({ queryKey: ['beads', project] })
      queryClient.invalidateQueries({ queryKey: ['bead', project, bead.id] })
    },
  })

  const errorMessage =
    mutation.error instanceof Error ? mutation.error.message : null

  function save() {
    if (!title.trim() || mutation.isPending) return
    mutation.mutate(buildUpdate())
  }

  function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    save()
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-h-[88vh] overflow-y-auto sm:max-w-2xl">
        <DialogHeader>
          <DialogTitle>Edit bead</DialogTitle>
          <DialogDescription>
            Updates <span className="font-mono text-foreground">{bead.id}</span>{' '}
            in <span className="font-mono text-foreground">{project}</span>.
          </DialogDescription>
        </DialogHeader>

        <form className="flex flex-col gap-4" onSubmit={submit}>
          <div className="flex flex-col gap-1.5">
            <Label htmlFor="edit-bead-title">Title</Label>
            <Input
              id="edit-bead-title"
              value={title}
              onChange={(event) => setTitle(event.target.value)}
              autoComplete="off"
              autoFocus
            />
          </div>

          <div className="grid gap-3 sm:grid-cols-3">
            <div className="flex flex-col gap-1.5">
              <Label htmlFor="edit-bead-type">Type</Label>
              <Select value={issueType} onValueChange={setIssueType}>
                <SelectTrigger id="edit-bead-type" className="w-full">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {EDIT_TYPES.map((type) => (
                    <SelectItem key={type.value} value={type.value}>
                      {type.label}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            <div className="flex flex-col gap-1.5">
              <Label htmlFor="edit-bead-priority">Priority</Label>
              <Select value={priority} onValueChange={setPriority}>
                <SelectTrigger id="edit-bead-priority" className="w-full">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {PRIORITIES.map((value) => (
                    <SelectItem key={value} value={String(value)}>
                      P{value}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            <div className="flex flex-col gap-1.5">
              <Label htmlFor="edit-bead-assignee">Assignee</Label>
              <Input
                id="edit-bead-assignee"
                value={assignee}
                onChange={(event) => setAssignee(event.target.value)}
                autoComplete="off"
                placeholder="Unassigned"
              />
            </div>
          </div>

          <div className="flex flex-col gap-1.5">
            <Label htmlFor="edit-bead-labels">Labels</Label>
            <LabelsInput
              id="edit-bead-labels"
              value={labels}
              onChange={setLabels}
              counts={counts}
            />
          </div>

          <div className="flex flex-col gap-1.5">
            <Label htmlFor="edit-bead-description">Description</Label>
            <Textarea
              id="edit-bead-description"
              value={description}
              onChange={(event) => setDescription(event.target.value)}
              className="min-h-28 resize-y"
            />
          </div>

          <div className="flex flex-col gap-1.5">
            <Label htmlFor="edit-bead-acceptance">Acceptance criteria</Label>
            <Textarea
              id="edit-bead-acceptance"
              value={acceptance}
              onChange={(event) => setAcceptance(event.target.value)}
              className="min-h-24 resize-y"
            />
          </div>

          <div className="grid gap-3 sm:grid-cols-2">
            <div className="flex flex-col gap-1.5">
              <Label htmlFor="edit-bead-design">Design</Label>
              <Textarea
                id="edit-bead-design"
                value={design}
                onChange={(event) => setDesign(event.target.value)}
                className="min-h-20 resize-y"
              />
            </div>

            <div className="flex flex-col gap-1.5">
              <Label htmlFor="edit-bead-notes">Notes</Label>
              <Textarea
                id="edit-bead-notes"
                value={notes}
                onChange={(event) => setNotes(event.target.value)}
                className="min-h-20 resize-y"
              />
            </div>
          </div>

          {errorMessage ? (
            <p className="rounded-md border border-destructive/30 bg-destructive/10 px-3 py-2 text-sm text-destructive">
              {errorMessage}
            </p>
          ) : null}

          <DialogFooter className="sticky bottom-0 z-10 shrink-0">
            <Button
              type="button"
              variant="ghost"
              onClick={() => onOpenChange(false)}
              disabled={mutation.isPending}
            >
              Cancel
            </Button>
            <Button
              type="button"
              disabled={!title.trim() || mutation.isPending}
              onClick={save}
            >
              {mutation.isPending ? (
                <Loader2 className="size-3.5 animate-spin" aria-hidden="true" />
              ) : null}
              Save changes
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  )
}

function BeadDeleteDialog({
  project,
  bead,
  open,
  onOpenChange,
  onDeleted,
}: {
  project: string
  bead: Bead
  open: boolean
  onOpenChange: (open: boolean) => void
  onDeleted: () => void
}) {
  const queryClient = useQueryClient()
  const [confirmation, setConfirmation] = useState('')
  const isConfirmed = confirmation.trim() === bead.id

  useEffect(() => {
    if (open) setConfirmation('')
  }, [open, bead.id])

  const previewQuery = useQuery({
    queryKey: ['delete-preview', project, bead.id],
    queryFn: () => previewDeleteBeadFn({ data: { project, id: bead.id } }),
    enabled: open,
    retry: false,
  })

  const mutation = useMutation({
    mutationFn: () => deleteBeadFn({ data: { project, id: bead.id } }),
    onSuccess: () => {
      toast.success(`Bead ${bead.id} deleted`)
      queryClient.invalidateQueries({ queryKey: ['beads', project] })
      queryClient.invalidateQueries({ queryKey: ['projects'] })
      queryClient.removeQueries({ queryKey: ['bead', project, bead.id] })
      queryClient.removeQueries({
        queryKey: ['delete-preview', project, bead.id],
      })
      onOpenChange(false)
      onDeleted()
    },
    onError: (error) => {
      toast.error(
        error instanceof Error ? error.message : 'Failed to delete bead',
      )
    },
  })

  const plan = previewQuery.data
  const preview = plan?.preview.trim()
  const subtasks = plan ? plan.ids.slice(1) : []
  const errorMessage =
    mutation.error || previewQuery.error
      ? toErrorMessage(mutation.error ?? previewQuery.error, 'Delete failed')
      : null

  function confirmDelete() {
    if (!isConfirmed || mutation.isPending) return
    mutation.mutate()
  }

  function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    confirmDelete()
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-h-[88vh] overflow-y-auto sm:max-w-xl">
        <DialogHeader>
          <DialogTitle>Delete bead</DialogTitle>
          <DialogDescription>
            This will permanently delete{' '}
            <span className="font-mono text-foreground">{bead.id}</span>:{' '}
            <span className="text-foreground">{bead.title}</span>.
          </DialogDescription>
        </DialogHeader>

        <form className="flex flex-col gap-4" onSubmit={submit}>
          <div className="rounded-lg border border-destructive/30 bg-destructive/10 px-3 py-2 text-sm text-destructive">
            <div className="flex items-start gap-2">
              <AlertTriangle
                className="mt-0.5 size-4 shrink-0"
                aria-hidden="true"
              />
              <div>
                <p className="font-medium">This action cannot be undone.</p>
                <p className="mt-1 text-destructive/85">
                  The bead will be removed through the bd CLI delete command.
                </p>
              </div>
            </div>
          </div>

          {subtasks.length > 0 || (plan && plan.unlinked.length > 0) ? (
            <div className="rounded-lg border border-border bg-muted/40 px-3 py-2 text-sm">
              {subtasks.length > 0 ? (
                <>
                  <p className="font-medium text-foreground">
                    Also deletes {subtasks.length}{' '}
                    {subtasks.length === 1 ? 'subtask' : 'subtasks'}
                  </p>
                  <p className="mt-1 font-mono text-xs text-muted-foreground">
                    {subtasks.join(', ')}
                  </p>
                </>
              ) : null}
              {plan && plan.unlinked.length > 0 ? (
                <div className={subtasks.length > 0 ? 'mt-3' : undefined}>
                  <p className="font-medium text-foreground">
                    Kept, link removed
                  </p>
                  <ul className="mt-1.5 space-y-1 text-muted-foreground">
                    {plan.unlinked.map((dep) => (
                      <li key={`${dep.id}|${dep.type}`} className="flex gap-2">
                        <span className="shrink-0 font-mono text-xs">
                          {dep.id}
                        </span>
                        <span className="min-w-0 truncate">{dep.title}</span>
                        <span className="shrink-0 text-xs text-faint">
                          {dep.type}
                        </span>
                      </li>
                    ))}
                  </ul>
                </div>
              ) : null}
            </div>
          ) : null}

          <div className="flex flex-col gap-1.5">
            <Label htmlFor="delete-bead-confirmation">
              Type {bead.id} to confirm
            </Label>
            <Input
              id="delete-bead-confirmation"
              value={confirmation}
              onChange={(event) => setConfirmation(event.target.value)}
              autoComplete="off"
              autoFocus
            />
          </div>

          <div className="flex flex-col gap-1.5">
            <Label>bd delete preview</Label>
            <div className="max-h-40 overflow-auto rounded-md border border-border bg-muted/40 p-3">
              {previewQuery.isFetching ? (
                <div className="flex items-center gap-2 text-xs text-muted-foreground">
                  <Loader2
                    className="size-3.5 animate-spin"
                    aria-hidden="true"
                  />
                  Loading preview...
                </div>
              ) : preview ? (
                <pre className="whitespace-pre-wrap font-mono text-xs text-muted-foreground">
                  {preview}
                </pre>
              ) : (
                <p className="text-xs text-muted-foreground">
                  No preview output.
                </p>
              )}
            </div>
          </div>

          {errorMessage ? (
            <p className="rounded-md border border-destructive/30 bg-destructive/10 px-3 py-2 text-sm text-destructive">
              {errorMessage}
            </p>
          ) : null}

          <DialogFooter className="sticky bottom-0 z-10 shrink-0">
            <Button
              type="button"
              variant="ghost"
              onClick={() => onOpenChange(false)}
              disabled={mutation.isPending}
            >
              Cancel
            </Button>
            <Button
              type="button"
              variant="destructive"
              disabled={!isConfirmed || mutation.isPending}
              onClick={confirmDelete}
            >
              {mutation.isPending ? (
                <Loader2 className="size-3.5 animate-spin" aria-hidden="true" />
              ) : (
                <Trash2 className="size-3.5" aria-hidden="true" />
              )}
              Delete bead
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  )
}

export function BeadDetailModal({
  project,
  bead,
  open,
  onOpenChange,
  onOpenBead,
  resolveBead,
  onOpenKnowledge,
  action,
  onActionHandled,
}: BeadDetailModalProps) {
  const queryClient = useQueryClient()
  const [comment, setComment] = useState('')
  const [editOpen, setEditOpen] = useState(false)
  const [deleteOpen, setDeleteOpen] = useState(false)
  const [closeOpen, setCloseOpen] = useState(false)
  const [subtaskOpen, setSubtaskOpen] = useState(false)
  const [statusOpen, setStatusOpen] = useState(false)
  const [editField, setEditField] = useState<EditField>()
  // Kept in state (not read from `action`) because the action is cleared right
  // away, usually before the picker has mounted inside the freshly opened dialog.
  const [dueRequest, setDueRequest] = useState<number>()

  // Keyboard shortcuts open the existing controls for the open bead, then
  // report the request handled so a remount does not replay it.
  useEffect(() => {
    if (!open) {
      setDueRequest(undefined)
      return
    }
    if (!action) return
    switch (action.id) {
      case 'due':
        setDueRequest(action.nonce)
        break
      case 'status':
        setStatusOpen(true)
        break
      case 'close-bead':
        setCloseOpen(true)
        break
      case 'relation':
        requestAnimationFrame(() =>
          document
            .querySelector<HTMLInputElement>(
              '[data-bead-detail] [aria-label="Search beads"]',
            )
            ?.focus(),
        )
        break
      case 'priority':
        setEditField('priority')
        setEditOpen(true)
        break
      case 'assign':
        setEditField('assignee')
        setEditOpen(true)
        break
      case 'labels':
        setEditField('labels')
        setEditOpen(true)
        break
      case 'edit':
        setEditField(undefined)
        setEditOpen(true)
        break
    }
    onActionHandled()
  }, [action, open, onActionHandled])

  const detailQuery = useQuery({
    queryKey: ['bead', project, bead?.id],
    queryFn: () => getBeadDetailFn({ data: { project, id: bead!.id } }),
    enabled: open && !!bead,
    staleTime: 3000,
  })

  const knowledgeQuery = useQuery({
    queryKey: ['project-knowledge', project],
    queryFn: () => getProjectKnowledgeFn({ data: { project } }),
    enabled: open && !!bead,
    staleTime: 4000,
  })
  const beadKnowledge = useMemo(
    () =>
      (knowledgeQuery.data?.knowledge ?? []).filter(
        (entry) => entry.bead_id === bead?.id,
      ),
    [knowledgeQuery.data, bead?.id],
  )

  const detail = detailQuery.data
  const statusBadge = bead ? mapStatus(bead).badge : undefined
  const column: BeadColumn = bead ? mapStatus(bead).column : 'open'
  const childBeads = bead?.childBeads ?? []
  const doneChildren = useMemo(
    () => childBeads.filter((c) => mapStatus(c).column === 'closed').length,
    [childBeads],
  )
  const {
    blockedBy,
    blocks: blocking,
    related,
  } = useMemo(
    () => groupRelations(detail?.dependencies, detail?.dependents),
    [detail?.dependencies, detail?.dependents],
  )

  const statusMutation = useMutation({
    mutationFn: (status: BeadColumn) =>
      updateBeadStatusFn({ data: { project, id: bead!.id, status } }),
    onMutate: (status) =>
      patchCachedBead(queryClient, project, bead!.id, { status }),
    onError: (error, _status, undo) => {
      undo?.()
      toast.error(toErrorMessage(error, 'Failed to change status'))
    },
    onSettled: () => {
      queryClient.invalidateQueries({ queryKey: ['beads', project] })
      queryClient.invalidateQueries({ queryKey: ['bead', project, bead?.id] })
    },
  })

  const commentMutation = useMutation({
    mutationFn: (text: string) =>
      addCommentFn({ data: { project, id: bead!.id, text } }),
    onSuccess: () => {
      setComment('')
      queryClient.invalidateQueries({ queryKey: ['bead', project, bead?.id] })
      queryClient.invalidateQueries({ queryKey: ['beads', project] })
    },
  })

  const parentBead = bead?.parent ? resolveBead(bead.parent) : undefined
  const description = detail?.description ?? bead?.description ?? ''
  const acceptance = detail?.acceptance_criteria ?? bead?.acceptance_criteria
  const comments = detail?.comments ?? []

  return (
    <>
      <Dialog
        open={open && !editOpen && !deleteOpen && !closeOpen}
        onOpenChange={(next) => {
          if (!next) {
            setEditOpen(false)
            setDeleteOpen(false)
          }
          onOpenChange(next)
        }}
      >
        <DialogContent
          data-bead-detail=""
          className="grid max-h-[86vh] w-[94vw] max-w-3xl grid-cols-1 grid-rows-[minmax(0,1fr)] gap-0 overflow-hidden rounded-[14px] bg-background p-0 shadow-pop sm:max-w-3xl lg:max-w-[1080px] lg:grid-cols-[minmax(0,1fr)_268px]"
        >
          {bead ? (
            <>
              <div className="flex min-h-0 min-w-0 flex-col">
                <DialogHeader className="space-y-0 border-b border-border bg-canvas px-[22px] pt-4 pb-3.5 text-left">
                  <div className="flex flex-wrap items-center gap-1.5 pr-16">
                    <span className="font-mono text-xs text-muted-foreground">
                      {bead.id}
                    </span>
                    {isEpic(bead) ? (
                      <span className="inline-flex items-center gap-1 rounded-[4px] bg-primary/30 px-1.5 py-px text-badge font-semibold tracking-[0.06em] text-primary-text uppercase ring-1 ring-inset ring-ring/45">
                        <Layers className="size-3" aria-hidden="true" />
                        Epic
                      </span>
                    ) : (
                      <span className="rounded-[4px] bg-white/7 px-1.5 py-px text-badge font-semibold tracking-[0.06em] text-muted-foreground uppercase">
                        {bead.issue_type}
                      </span>
                    )}
                    <span
                      className={cn(
                        'rounded-[4px] px-1 py-px font-mono text-badge font-semibold tabular-nums ring-1 ring-inset ring-current',
                        PRIORITY_TEXT_CLASS[
                          Math.max(0, Math.min(4, bead.priority))
                        ],
                      )}
                    >
                      P{Math.max(0, Math.min(4, bead.priority))}
                    </span>
                    {mapStatus(bead).badge ? (
                      <span
                        className={cn(
                          'rounded-[4px] px-1.5 py-px text-badge font-semibold tracking-[0.06em] uppercase',
                          BADGE_TONE[mapStatus(bead).badge!.tone],
                        )}
                      >
                        {mapStatus(bead).badge!.label}
                      </span>
                    ) : null}

                    <div className="ml-auto flex shrink-0 items-center gap-1.5">
                      <Button
                        size="sm"
                        variant="outline"
                        onClick={() => {
                          setEditField(undefined)
                          setEditOpen(true)
                        }}
                      >
                        <Pencil className="size-3.5" aria-hidden="true" />
                        Edit
                      </Button>
                      <Button
                        size="sm"
                        variant="ghost"
                        onClick={() => setDeleteOpen(true)}
                      >
                        <Trash2 className="size-3.5" aria-hidden="true" />
                        Delete
                      </Button>
                    </div>
                  </div>

                  <DialogTitle className="mt-2.5 text-title leading-[1.28] font-semibold tracking-[-0.015em] text-balance">
                    {bead.title}
                  </DialogTitle>
                  <DialogDescription className="sr-only">
                    Bead details for {bead.id}
                  </DialogDescription>

                  {parentBead ? (
                    <Button
                      variant="link"
                      onClick={() => onOpenBead(parentBead)}
                      className="mt-2 h-auto w-fit max-w-full gap-1.5 p-0 text-xs text-muted-foreground"
                    >
                      <CornerUpLeft
                        className="size-3 shrink-0"
                        aria-hidden="true"
                      />
                      {isEpic(parentBead) ? 'Epic' : 'Parent'}:{' '}
                      <span className="font-mono">{parentBead.id}</span>
                      <span className="truncate">{parentBead.title}</span>
                    </Button>
                  ) : null}
                </DialogHeader>

                <div className="min-h-0 flex-1 overflow-y-auto px-[22px] py-[22px]">
                  <div className="flex flex-col gap-[26px]">
                    {isEpic(bead) || childBeads.length > 0 ? (
                      <section>
                        <SectionHeader
                          icon={ListTree}
                          label="Subtasks"
                          trailing={`${doneChildren}/${childBeads.length} completed`}
                          actions={
                            <Button
                              size="sm"
                              variant="ghost"
                              className="h-6 gap-1 px-1.5 text-badge"
                              onClick={() => setSubtaskOpen(true)}
                            >
                              <Plus className="size-3" aria-hidden="true" />
                              Subtask
                            </Button>
                          }
                        />
                        {childBeads.length === 0 ? (
                          <p className="text-xs text-muted-foreground/70">
                            No subtasks.
                          </p>
                        ) : (
                          <LinkedBeadList
                            items={childBeads.map((child) => ({
                              id: child.id,
                            }))}
                            resolveBead={resolveBead}
                            onOpenBead={onOpenBead}
                          />
                        )}
                      </section>
                    ) : null}

                    <section>
                      <RelationsEditor
                        project={project}
                        bead={bead}
                        groups={{ blockedBy, blocks: blocking, related }}
                        onOpenBead={onOpenBead}
                      />
                    </section>

                    {beadKnowledge.length > 0 ? (
                      <section>
                        <SectionHeader
                          icon={BookOpen}
                          label="Knowledge recorded here"
                          trailing={beadKnowledge.length}
                        />
                        <div className="flex flex-col gap-1.5">
                          {beadKnowledge.map((entry) => (
                            <InteractiveRow
                              key={entry.id}
                              size="cozy"
                              onClick={() => onOpenKnowledge(entry.id)}
                            >
                              <span
                                className={cn(
                                  'w-0.5 shrink-0 self-stretch rounded-full',
                                  K_DOT_CLASS[entry.type],
                                )}
                                aria-hidden="true"
                              />
                              <div className="min-w-0 flex-1">
                                <div className="flex items-center gap-1.5">
                                  <span
                                    className={cn(
                                      'inline-flex items-center gap-[5px] rounded-[4px] px-1.5 py-0.5 font-mono text-badge font-semibold tracking-[0.08em] uppercase',
                                      K_BG_CLASS[entry.type],
                                      K_TEXT_CLASS[entry.type],
                                    )}
                                  >
                                    <span
                                      className={cn(
                                        'size-[5px] shrink-0 rounded-full',
                                        K_DOT_CLASS[entry.type],
                                      )}
                                      aria-hidden="true"
                                    />
                                    {KNOWLEDGE_TYPE_LABEL[entry.type]}
                                  </span>
                                  <span className="ml-auto font-mono text-badge text-faint">
                                    {relativeDate(entry.created_at)}
                                  </span>
                                </div>
                                <p className="mt-1.5 line-clamp-2 text-body leading-[1.58] text-foreground/90">
                                  {entry.content}
                                </p>
                              </div>
                            </InteractiveRow>
                          ))}
                        </div>
                      </section>
                    ) : null}

                    <section>
                      <SectionHeader icon={AlignLeft} label="Description" />
                      {detailQuery.isLoading && !description ? (
                        <div className="flex flex-col gap-2">
                          <Skeleton className="h-3 w-full" />
                          <Skeleton className="h-3 w-5/6" />
                          <Skeleton className="h-3 w-2/3" />
                        </div>
                      ) : description ? (
                        <div className="prose prose-invert prose-sm max-w-none prose-headings:scroll-mt-4 prose-pre:bg-muted prose-pre:text-xs">
                          <Markdown>{description}</Markdown>
                        </div>
                      ) : (
                        <p className="text-xs text-muted-foreground/70">
                          No description.
                        </p>
                      )}
                    </section>

                    {acceptance ? (
                      <section>
                        <SectionHeader
                          icon={CircleCheck}
                          label="Acceptance criteria"
                        />
                        <div className="prose prose-invert prose-sm max-w-none">
                          <Markdown>{acceptance}</Markdown>
                        </div>
                      </section>
                    ) : null}

                    <section>
                      <SectionHeader
                        icon={MessageSquare}
                        label="Comments"
                        trailing={
                          comments.length > 0 ? comments.length : undefined
                        }
                      />
                      {detailQuery.isLoading ? (
                        <Skeleton className="h-12 w-full" />
                      ) : comments.length === 0 ? (
                        <p className="text-xs text-muted-foreground/70">
                          No comments yet.
                        </p>
                      ) : (
                        <ul className="flex flex-col gap-2">
                          {comments.map((c) => (
                            <li
                              key={c.id}
                              className="rounded-[9px] bg-canvas px-3 py-2.5 ring-1 ring-inset ring-border"
                            >
                              <div className="flex items-center gap-2 text-xs text-faint">
                                <span className="font-medium text-foreground/90">
                                  {c.author ?? 'Anonymous'}
                                </span>
                                {c.created_at ? (
                                  <span>· {relativeDate(c.created_at)}</span>
                                ) : null}
                              </div>
                              <p className="mt-1.5 text-body whitespace-pre-wrap">
                                {c.text}
                              </p>
                            </li>
                          ))}
                        </ul>
                      )}

                      <div className="mt-3 flex flex-col gap-2">
                        <Textarea
                          name="comment"
                          value={comment}
                          onChange={(e) => setComment(e.target.value)}
                          placeholder="Add a comment..."
                          className="min-h-20 resize-none"
                        />
                        <Button
                          size="sm"
                          className="w-fit self-end"
                          disabled={
                            !comment.trim() || commentMutation.isPending
                          }
                          onClick={() => commentMutation.mutate(comment.trim())}
                        >
                          {commentMutation.isPending ? (
                            <Loader2
                              className="size-3.5 animate-spin"
                              aria-hidden="true"
                            />
                          ) : null}
                          Comment
                        </Button>
                      </div>
                    </section>
                  </div>
                </div>
              </div>

              <div className="flex min-h-0 flex-col overflow-y-auto border-t border-border bg-sidebar p-[18px] lg:border-t-0 lg:border-l">
                <MetaField label="Status">
                  <Select
                    open={statusOpen}
                    onOpenChange={setStatusOpen}
                    value={statusBadge ? bead.status : column}
                    onValueChange={(v) => {
                      if (v === bead.status && statusBadge) return
                      // Closing asks for a reason and handles bd's close policy.
                      if (v === 'closed') setCloseOpen(true)
                      else statusMutation.mutate(v as BeadColumn)
                    }}
                  >
                    <SelectTrigger
                      size="sm"
                      className="h-[30px] w-full rounded-[7px]"
                      aria-label="Change status"
                    >
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      {statusBadge ? (
                        // Deferred, hooked, pinned and custom statuses have no
                        // column of their own: show the real one as current.
                        <SelectItem value={bead.status}>
                          <span
                            className={cn(
                              'size-1.5 rounded-full',
                              DOT_CLASS[column],
                            )}
                            aria-hidden="true"
                          />
                          {statusBadge.label}
                        </SelectItem>
                      ) : null}
                      {COLUMNS.map((c) => (
                        <SelectItem key={c.key} value={c.key}>
                          <span
                            className={cn(
                              'size-1.5 rounded-full',
                              DOT_CLASS[c.key],
                            )}
                            aria-hidden="true"
                          />
                          {COLUMN_LABEL[c.key]}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                  {statusMutation.isPending ? (
                    <Loader2
                      className="size-3.5 animate-spin text-muted-foreground"
                      aria-hidden="true"
                    />
                  ) : null}
                </MetaField>

                <MetaField label="Assignee">
                  {bead.assignee ? (
                    <>
                      <Avatar size="sm" className="size-[19px] bg-white/9">
                        <AvatarFallback className="bg-transparent text-badge font-semibold text-foreground">
                          {initials(bead.assignee)}
                        </AvatarFallback>
                      </Avatar>
                      {bead.assignee}
                    </>
                  ) : (
                    <span className="text-faint">Unassigned</span>
                  )}
                </MetaField>

                <MetaField label="Priority">
                  {(() => {
                    const p = Math.max(0, Math.min(4, bead.priority))
                    return (
                      <>
                        <span
                          className={cn(
                            'rounded-[4px] px-1 py-px font-mono text-badge font-semibold tabular-nums ring-1 ring-inset ring-current',
                            PRIORITY_TEXT_CLASS[p],
                          )}
                        >
                          P{p}
                        </span>
                        <span className="text-muted-foreground">
                          {PRIORITY_WORD[p]}
                        </span>
                      </>
                    )
                  })()}
                </MetaField>

                <MetaField label="Type">
                  <span className="font-mono text-body">{bead.issue_type}</span>
                </MetaField>
                <MetaField label="Due date">
                  <DueDatePicker
                    project={project}
                    bead={bead}
                    openRequest={dueRequest}
                  />
                </MetaField>

                <MetaField label="Estimate">
                  <EstimateInput key={bead.id} project={project} bead={bead} />
                </MetaField>

                <MetaField label="Snooze">
                  <SnoozeMenu project={project} bead={bead} />
                </MetaField>

                <MetaField label="Labels">
                  {bead.labels && bead.labels.length > 0 ? (
                    <span className="flex flex-wrap gap-1.5">
                      {bead.labels.map((label) => (
                        <span
                          key={label}
                          className="max-w-[92px] truncate rounded-[4px] px-[5px] text-badge leading-[1.6] text-muted-foreground ring-1 ring-inset ring-border-strong"
                        >
                          {label}
                        </span>
                      ))}
                    </span>
                  ) : (
                    <span className="text-faint">None</span>
                  )}
                </MetaField>

                <hr className="my-4 border-border" />

                <MetaField label="Updated">
                  <span className="font-mono text-body text-muted-foreground">
                    {relativeDate(bead.updated_at)}
                  </span>
                </MetaField>

                <MetaField label="Edges">
                  <span className="flex items-center gap-3 text-body text-muted-foreground">
                    <span
                      className="inline-flex items-center gap-1"
                      title={`${blockedBy.length} blocked by`}
                    >
                      <Ban className="size-3" aria-hidden="true" />
                      {blockedBy.length}
                    </span>
                    <span
                      className="inline-flex items-center gap-1"
                      title={`${blocking.length} blocking`}
                    >
                      <Waypoints className="size-3" aria-hidden="true" />
                      {blocking.length}
                    </span>
                    <span
                      className="inline-flex items-center gap-1"
                      title={`${related.length} related`}
                    >
                      <Link2 className="size-3" aria-hidden="true" />
                      {related.length}
                    </span>
                  </span>
                </MetaField>

                <hr className="my-4 border-border" />

                <span className="mb-[7px] block font-mono text-badge font-medium tracking-[0.09em] text-faint uppercase">
                  bd command
                </span>
                <p className="rounded-[7px] bg-black/35 px-[11px] py-[9px] font-mono text-xs leading-[1.55] text-muted-foreground ring-1 ring-inset ring-border">
                  bd show {bead.id} --json
                </p>
              </div>
            </>
          ) : (
            <>
              <DialogTitle className="sr-only">Loading bead</DialogTitle>
              <div className="flex h-48 items-center justify-center">
                <Loader2
                  className="size-5 animate-spin text-muted-foreground"
                  aria-hidden="true"
                />
              </div>
            </>
          )}
        </DialogContent>
      </Dialog>

      {bead ? (
        <BeadEditDialog
          project={project}
          bead={bead}
          detail={detail}
          initialField={editField}
          open={editOpen}
          onOpenChange={setEditOpen}
        />
      ) : null}

      {bead ? (
        <BeadDeleteDialog
          project={project}
          bead={bead}
          open={deleteOpen}
          onOpenChange={setDeleteOpen}
          onDeleted={() => onOpenChange(false)}
        />
      ) : null}

      <CloseBeadDialog
        project={project}
        beads={bead ? [bead] : []}
        open={closeOpen}
        onOpenChange={setCloseOpen}
      />

      {bead ? (
        <CreateBeadDialog
          project={project}
          epics={[]}
          open={subtaskOpen}
          onOpenChange={setSubtaskOpen}
          lockedParent={{ id: bead.id, title: bead.title }}
        />
      ) : null}
    </>
  )
}
