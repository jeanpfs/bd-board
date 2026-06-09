import { useMemo, useState } from 'react'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { formatDistanceToNow } from 'date-fns'
import { ptBR } from 'date-fns/locale'
import Markdown from 'react-markdown'
import { ChevronRight, CornerUpLeft, Layers, Loader2 } from 'lucide-react'

import {
  Sheet,
  SheetContent,
  SheetDescription,
  SheetHeader,
  SheetTitle,
} from '@/components/ui/sheet'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Textarea } from '@/components/ui/textarea'
import { Separator } from '@/components/ui/separator'
import { ScrollArea } from '@/components/ui/scroll-area'
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
import { addCommentFn, getBeadDetailFn, updateBeadStatusFn } from '@/lib/server'

import type { Bead, BeadColumn } from '@/lib/types'

interface BeadDetailSheetProps {
  project: string
  bead: Bead | null
  open: boolean
  onOpenChange: (open: boolean) => void
  onOpenBead: (bead: Bead) => void
  resolveBead: (id: string) => Bead | undefined
}

const COLUMN_LABEL: Record<BeadColumn, string> = {
  open: 'Aberto',
  in_progress: 'Em progresso',
  blocked: 'Bloqueado',
  closed: 'Fechado',
}

const COLUMN_BADGE: Record<BeadColumn, string> = {
  open: 'border-status-open/40 bg-status-open/10 text-status-open',
  in_progress: 'border-status-progress/40 bg-status-progress/10 text-status-progress',
  blocked: 'border-status-blocked/40 bg-status-blocked/10 text-status-blocked',
  closed: 'border-status-closed/40 bg-status-closed/10 text-status-closed',
}

const DOT_CLASS: Record<BeadColumn, string> = {
  open: 'bg-status-open',
  in_progress: 'bg-status-progress',
  blocked: 'bg-status-blocked',
  closed: 'bg-status-closed',
}

function relativeDate(value?: string): string {
  if (!value) return ''
  const parsed = new Date(value)
  if (Number.isNaN(parsed.getTime())) return ''
  return formatDistanceToNow(parsed, { addSuffix: true, locale: ptBR })
}

export function BeadDetailSheet({
  project,
  bead,
  open,
  onOpenChange,
  onOpenBead,
  resolveBead,
}: BeadDetailSheetProps) {
  const queryClient = useQueryClient()
  const [comment, setComment] = useState('')

  const detailQuery = useQuery({
    queryKey: ['bead', project, bead?.id],
    queryFn: () => getBeadDetailFn({ data: { project, id: bead!.id } }),
    enabled: open && !!bead,
    staleTime: 3000,
  })

  const detail = detailQuery.data
  const column: BeadColumn = bead ? mapStatus(bead.status).column : 'open'
  const childBeads = bead?.childBeads ?? []
  const doneChildren = useMemo(
    () => childBeads.filter((c) => mapStatus(c.status).column === 'closed').length,
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

  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      <SheetContent className="flex w-full flex-col gap-0 p-0 sm:max-w-xl">
        {bead ? (
          <>
            <SheetHeader className="gap-2 border-b border-border px-5 py-4">
              <div className="flex flex-wrap items-center gap-2">
                <span className="font-mono text-xs text-muted-foreground">{bead.id}</span>
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
                    Épico
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
              <SheetTitle className="text-left text-base leading-snug">
                {bead.title}
              </SheetTitle>
              <SheetDescription className="sr-only">
                Detalhes da bead {bead.id}
              </SheetDescription>

              {parentBead ? (
                <button
                  type="button"
                  onClick={() => onOpenBead(parentBead)}
                  className="inline-flex w-fit items-center gap-1 rounded text-xs text-muted-foreground transition-colors hover:text-foreground"
                >
                  <CornerUpLeft className="size-3" aria-hidden="true" />
                  Épico: <span className="font-mono">{parentBead.id}</span>
                </button>
              ) : null}

              <div className="flex items-center gap-2 pt-1">
                <Select
                  value={column}
                  onValueChange={(v) => statusMutation.mutate(v as BeadColumn)}
                >
                  <SelectTrigger size="sm" className="h-7 w-40">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {COLUMNS.map((c) => (
                      <SelectItem key={c.key} value={c.key}>
                        <span
                          className={cn('size-1.5 rounded-full', DOT_CLASS[c.key])}
                          aria-hidden="true"
                        />
                        {COLUMN_LABEL[c.key]}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
                {statusMutation.isPending ? (
                  <Loader2 className="size-3.5 animate-spin text-muted-foreground" aria-hidden="true" />
                ) : null}
                {bead.assignee ? (
                  <span className="ml-auto truncate text-xs text-muted-foreground">
                    {bead.assignee}
                  </span>
                ) : null}
              </div>

              {bead.labels && bead.labels.length > 0 ? (
                <div className="flex flex-wrap gap-1 pt-1">
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
            </SheetHeader>

            <ScrollArea className="min-h-0 flex-1">
              <div className="flex flex-col gap-5 px-5 py-4">
                {isEpic(bead) ? (
                  <section className="flex flex-col gap-2">
                    <div className="flex items-center justify-between">
                      <h3 className="text-sm font-medium">Sub-tarefas</h3>
                      <span className="text-xs tabular-nums text-muted-foreground">
                        {doneChildren}/{childBeads.length} concluídas
                      </span>
                    </div>
                    {childBeads.length === 0 ? (
                      <p className="text-xs text-muted-foreground/70">Sem sub-tarefas.</p>
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
                                  className={cn('size-2 shrink-0 rounded-full', DOT_CLASS[col])}
                                  aria-hidden="true"
                                />
                                <span className="font-mono text-[0.7rem] text-muted-foreground">
                                  {child.id}
                                </span>
                                <span className="truncate text-sm">{child.title}</span>
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
                    <Separator className="mt-1" />
                  </section>
                ) : null}

                <section className="flex flex-col gap-2">
                  <h3 className="text-sm font-medium">Descrição</h3>
                  {detailQuery.isLoading && !description ? (
                    <div className="flex flex-col gap-2">
                      <Skeleton className="h-3 w-full" />
                      <Skeleton className="h-3 w-5/6" />
                      <Skeleton className="h-3 w-2/3" />
                    </div>
                  ) : description ? (
                    <div className="prose prose-invert prose-sm max-w-none prose-pre:bg-muted prose-pre:text-xs">
                      <Markdown>{description}</Markdown>
                    </div>
                  ) : (
                    <p className="text-xs text-muted-foreground/70">Sem descrição.</p>
                  )}
                </section>

                {acceptance ? (
                  <section className="flex flex-col gap-2">
                    <h3 className="text-sm font-medium">Critérios de aceitação</h3>
                    <div className="prose prose-invert prose-sm max-w-none">
                      <Markdown>{acceptance}</Markdown>
                    </div>
                  </section>
                ) : null}

                <Separator />

                <section className="flex flex-col gap-3">
                  <h3 className="text-sm font-medium">Comentários</h3>
                  {detailQuery.isLoading ? (
                    <Skeleton className="h-12 w-full" />
                  ) : comments.length === 0 ? (
                    <p className="text-xs text-muted-foreground/70">Sem comentários ainda.</p>
                  ) : (
                    <ul className="flex flex-col gap-3">
                      {comments.map((c) => (
                        <li key={c.id} className="rounded-lg bg-muted/40 px-3 py-2">
                          <div className="flex items-center gap-2 text-xs text-muted-foreground">
                            <span className="font-medium text-foreground/80">
                              {c.author ?? 'Anônimo'}
                            </span>
                            {c.created_at ? <span>· {relativeDate(c.created_at)}</span> : null}
                          </div>
                          <p className="mt-1 text-sm whitespace-pre-wrap">{c.text}</p>
                        </li>
                      ))}
                    </ul>
                  )}

                  <div className="flex flex-col gap-2">
                    <Textarea
                      value={comment}
                      onChange={(e) => setComment(e.target.value)}
                      placeholder="Adicionar um comentário…"
                      className="min-h-20 resize-none"
                    />
                    <Button
                      size="sm"
                      className="w-fit self-end"
                      disabled={!comment.trim() || commentMutation.isPending}
                      onClick={() => commentMutation.mutate(comment.trim())}
                    >
                      {commentMutation.isPending ? (
                        <Loader2 className="size-3.5 animate-spin" aria-hidden="true" />
                      ) : null}
                      Comentar
                    </Button>
                  </div>
                </section>
              </div>
            </ScrollArea>
          </>
        ) : null}
      </SheetContent>
    </Sheet>
  )
}
