import { useEffect, useMemo, useState } from 'react'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { formatDistanceToNow } from 'date-fns'
import { enUS } from 'date-fns/locale'
import Markdown from 'react-markdown'
import {
  AlignLeft,
  ChevronRight,
  CircleCheck,
  CornerUpLeft,
  Layers,
  ListTree,
  Loader2,
  MessageSquare,
  Pencil,
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
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
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
import { cn } from '@/lib/utils'
import { COLUMNS, isEpic, mapStatus } from '@/lib/types'
import {
  addCommentFn,
  getBeadDetailFn,
  getWriteConfigFn,
  updateBeadFn,
  updateBeadStatusFn,
} from '@/lib/server'

import type { LucideIcon } from 'lucide-react'
import type { FormEvent, ReactNode } from 'react'
import type { Bead, BeadColumn, BeadDetail } from '@/lib/types'

interface BeadDetailModalProps {
  project: string
  bead: Bead | null
  open: boolean
  onOpenChange: (open: boolean) => void
  onOpenBead: (bead: Bead) => void
  resolveBead: (id: string) => Bead | undefined
}

const COLUMN_LABEL: Record<BeadColumn, string> = {
  open: 'Open',
  in_progress: 'In progress',
  blocked: 'Blocked',
  closed: 'Closed',
}

const COLUMN_BADGE: Record<BeadColumn, string> = {
  open: 'border-status-open/40 bg-status-open/10 text-status-open',
  in_progress:
    'border-status-progress/40 bg-status-progress/10 text-status-progress',
  blocked: 'border-status-blocked/40 bg-status-blocked/10 text-status-blocked',
  closed: 'border-status-closed/40 bg-status-closed/10 text-status-closed',
}

const DOT_CLASS: Record<BeadColumn, string> = {
  open: 'bg-status-open',
  in_progress: 'bg-status-progress',
  blocked: 'bg-status-blocked',
  closed: 'bg-status-closed',
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

function relativeDate(value?: string): string {
  if (!value) return ''
  const parsed = new Date(value)
  if (Number.isNaN(parsed.getTime())) return ''
  return formatDistanceToNow(parsed, { addSuffix: true, locale: enUS })
}

function labelsFromText(value: string): string[] {
  return value
    .split(',')
    .map((label) => label.trim())
    .filter(Boolean)
}

function SectionHeader({
  icon: Icon,
  label,
  trailing,
}: {
  icon: LucideIcon
  label: string
  trailing?: ReactNode
}) {
  return (
    <div className="mb-3 flex items-center gap-2 border-b border-border/60 pb-2">
      <Icon className="size-3.5 text-muted-foreground" aria-hidden="true" />
      <h3 className="text-[0.7rem] font-semibold uppercase tracking-[0.09em] text-muted-foreground">
        {label}
      </h3>
      {trailing != null ? (
        <span className="ml-auto text-xs tabular-nums text-muted-foreground/70">
          {trailing}
        </span>
      ) : null}
    </div>
  )
}

function BeadEditDialog({
  project,
  bead,
  detail,
  open,
  onOpenChange,
}: {
  project: string
  bead: Bead
  detail?: BeadDetail
  open: boolean
  onOpenChange: (open: boolean) => void
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
  const [labels, setLabels] = useState('')

  useEffect(() => {
    if (!open) return
    const source = detail ?? bead
    setTitle(source.title ?? '')
    setDescription(source.description ?? '')
    setAcceptance(source.acceptance_criteria ?? '')
    setDesign(source.design ?? '')
    setNotes(source.notes ?? '')
    setPriority(String(Math.max(0, Math.min(4, source.priority ?? 2))))
    setIssueType(source.issue_type || 'task')
    setAssignee(source.assignee ?? '')
    setLabels((source.labels ?? []).join(', '))
  }, [bead, detail, open])

  const mutation = useMutation({
    mutationFn: () =>
      updateBeadFn({
        data: {
          project,
          id: bead.id,
          title,
          description,
          acceptance_criteria: acceptance,
          design,
          notes,
          priority: Number(priority),
          issue_type: issueType,
          assignee,
          labels: labelsFromText(labels),
        },
      }),
    onSuccess: () => {
      toast.success(`Bead ${bead.id} updated`)
      queryClient.invalidateQueries({ queryKey: ['beads', project] })
      queryClient.invalidateQueries({ queryKey: ['bead', project, bead.id] })
      onOpenChange(false)
    },
    onError: (error) => {
      toast.error(
        error instanceof Error ? error.message : 'Failed to update bead',
      )
    },
  })

  const errorMessage =
    mutation.error instanceof Error ? mutation.error.message : null

  function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    if (!title.trim() || mutation.isPending) return
    mutation.mutate()
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
            <Input
              id="edit-bead-labels"
              value={labels}
              onChange={(event) => setLabels(event.target.value)}
              autoComplete="off"
              placeholder="ui, backend"
            />
            <p className="text-xs text-muted-foreground">
              Separate labels with commas.
            </p>
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

          <DialogFooter>
            <Button
              type="button"
              variant="ghost"
              onClick={() => onOpenChange(false)}
              disabled={mutation.isPending}
            >
              Cancel
            </Button>
            <Button
              type="submit"
              disabled={!title.trim() || mutation.isPending}
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

export function BeadDetailModal({
  project,
  bead,
  open,
  onOpenChange,
  onOpenBead,
  resolveBead,
}: BeadDetailModalProps) {
  const queryClient = useQueryClient()
  const [comment, setComment] = useState('')
  const [editOpen, setEditOpen] = useState(false)

  const detailQuery = useQuery({
    queryKey: ['bead', project, bead?.id],
    queryFn: () => getBeadDetailFn({ data: { project, id: bead!.id } }),
    enabled: open && !!bead,
    staleTime: 3000,
  })

  const writeConfigQuery = useQuery({
    queryKey: ['write-config'],
    queryFn: () => getWriteConfigFn(),
    staleTime: Infinity,
  })

  const detail = detailQuery.data
  const column: BeadColumn = bead ? mapStatus(bead.status).column : 'open'
  const childBeads = bead?.childBeads ?? []
  const doneChildren = useMemo(
    () =>
      childBeads.filter((c) => mapStatus(c.status).column === 'closed').length,
    [childBeads],
  )

  const statusMutation = useMutation({
    mutationFn: (status: BeadColumn) =>
      updateBeadStatusFn({ data: { project, id: bead!.id, status } }),
    onSuccess: () => {
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
  const canWrite = writeConfigQuery.data?.writesEnabled === true

  return (
    <>
      <Dialog
        open={open}
        onOpenChange={(next) => {
          if (!next) setEditOpen(false)
          onOpenChange(next)
        }}
      >
        <DialogContent className="flex max-h-[86vh] w-[94vw] max-w-3xl flex-col gap-0 overflow-hidden p-0 sm:max-w-3xl lg:max-w-4xl">
          {bead ? (
            <>
              <DialogHeader className="space-y-0 border-b border-border px-6 py-5 text-left">
                <div className="flex flex-col gap-3">
                  <div className="flex items-start justify-between gap-3 pr-8">
                    <div className="flex flex-wrap items-center gap-2">
                      <span className="font-mono text-xs text-muted-foreground">
                        {bead.id}
                      </span>
                      <span
                        className={cn(
                          'rounded border px-1.5 py-px text-[0.65rem] font-medium',
                          COLUMN_BADGE[column],
                        )}
                      >
                        {COLUMN_LABEL[column]}
                      </span>
                      {isEpic(bead) ? (
                        <span className="inline-flex items-center gap-1 rounded bg-primary/10 px-1.5 py-px text-[0.65rem] font-semibold uppercase tracking-wide text-primary ring-1 ring-inset ring-primary/25">
                          <Layers className="size-3" aria-hidden="true" />
                          Epic
                        </span>
                      ) : (
                        <span className="rounded border border-border px-1.5 py-px text-[0.65rem] text-muted-foreground">
                          {bead.issue_type}
                        </span>
                      )}
                      <span className="rounded border border-border px-1.5 py-px text-[0.65rem] tabular-nums text-muted-foreground">
                        P{Math.max(0, Math.min(4, bead.priority))}
                      </span>
                    </div>

                    {canWrite ? (
                      <Button
                        size="sm"
                        variant="outline"
                        className="h-7 shrink-0"
                        onClick={() => setEditOpen(true)}
                      >
                        <Pencil className="size-3.5" aria-hidden="true" />
                        Edit
                      </Button>
                    ) : null}
                  </div>

                  <DialogTitle className="text-xl leading-tight font-semibold tracking-tight text-balance">
                    {bead.title}
                  </DialogTitle>
                  <DialogDescription className="sr-only">
                    Bead details for {bead.id}
                  </DialogDescription>

                  {parentBead ? (
                    <button
                      type="button"
                      onClick={() => onOpenBead(parentBead)}
                      className="-mt-0.5 inline-flex w-fit items-center gap-1 rounded text-xs text-muted-foreground transition-colors hover:text-foreground"
                    >
                      <CornerUpLeft className="size-3" aria-hidden="true" />
                      Epic: <span className="font-mono">{parentBead.id}</span>
                    </button>
                  ) : null}

                  <div className="flex flex-wrap items-center gap-x-5 gap-y-2 pt-0.5">
                    <div className="flex items-center gap-2">
                      <span className="text-[0.7rem] font-medium uppercase tracking-wide text-muted-foreground/70">
                        Status
                      </span>
                      <Select
                        value={column}
                        onValueChange={(v) =>
                          statusMutation.mutate(v as BeadColumn)
                        }
                      >
                        <SelectTrigger
                          size="sm"
                          className="h-7 w-40"
                          aria-label="Change status"
                        >
                          <SelectValue />
                        </SelectTrigger>
                        <SelectContent>
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
                    </div>

                    {bead.assignee ? (
                      <div className="flex items-center gap-2">
                        <span className="text-[0.7rem] font-medium uppercase tracking-wide text-muted-foreground/70">
                          Assignee
                        </span>
                        <span className="text-sm text-foreground/90">
                          {bead.assignee}
                        </span>
                      </div>
                    ) : null}
                  </div>

                  {bead.labels && bead.labels.length > 0 ? (
                    <div className="flex flex-wrap items-center gap-x-2 gap-y-1">
                      <span className="text-[0.7rem] font-medium uppercase tracking-wide text-muted-foreground/70">
                        Labels
                      </span>
                      {bead.labels.map((label) => (
                        <Badge
                          key={label}
                          variant="outline"
                          className="h-5 px-1.5 text-[0.65rem] font-normal"
                        >
                          {label}
                        </Badge>
                      ))}
                    </div>
                  ) : null}
                </div>
              </DialogHeader>

              <div className="min-h-0 flex-1 overflow-y-auto px-6 py-6">
                <div className="flex flex-col gap-7">
                  {isEpic(bead) ? (
                    <section>
                      <SectionHeader
                        icon={ListTree}
                        label="Child tasks"
                        trailing={`${doneChildren}/${childBeads.length} completed`}
                      />
                      {childBeads.length === 0 ? (
                        <p className="text-xs text-muted-foreground/70">
                          No child tasks.
                        </p>
                      ) : (
                        <ul className="flex flex-col gap-0.5">
                          {childBeads.map((child) => {
                            const col = mapStatus(child.status).column
                            return (
                              <li key={child.id}>
                                <button
                                  type="button"
                                  onClick={() => onOpenBead(child)}
                                  className="flex w-full items-center gap-2 rounded-md px-2 py-1.5 text-left transition-colors hover:bg-accent/50"
                                >
                                  <span
                                    className={cn(
                                      'size-2 shrink-0 rounded-full',
                                      DOT_CLASS[col],
                                    )}
                                    aria-hidden="true"
                                  />
                                  <span className="font-mono text-[0.7rem] text-muted-foreground">
                                    {child.id}
                                  </span>
                                  <span className="truncate text-sm">
                                    {child.title}
                                  </span>
                                  <ChevronRight
                                    className="ml-auto size-3.5 shrink-0 text-muted-foreground/50"
                                    aria-hidden="true"
                                  />
                                </button>
                              </li>
                            )
                          })}
                        </ul>
                      )}
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
                      <ul className="flex flex-col gap-3">
                        {comments.map((c) => (
                          <li
                            key={c.id}
                            className="rounded-lg bg-muted/40 px-3 py-2"
                          >
                            <div className="flex items-center gap-2 text-xs text-muted-foreground">
                              <span className="font-medium text-foreground/80">
                                {c.author ?? 'Anonymous'}
                              </span>
                              {c.created_at ? (
                                <span>· {relativeDate(c.created_at)}</span>
                              ) : null}
                            </div>
                            <p className="mt-1 text-sm whitespace-pre-wrap">
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
                        disabled={!comment.trim() || commentMutation.isPending}
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
          open={editOpen}
          onOpenChange={setEditOpen}
        />
      ) : null}
    </>
  )
}
