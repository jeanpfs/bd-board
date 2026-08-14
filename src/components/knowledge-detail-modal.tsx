import { useQuery } from '@tanstack/react-query'
import { formatDistanceToNow } from 'date-fns'
import { enUS } from 'date-fns/locale'
import {
  BookOpen,
  Copy,
  CornerDownRight,
  Layers,
  Loader2,
  X,
} from 'lucide-react'
import { toast } from 'sonner'

import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogTitle,
} from '@/components/ui/dialog'
import { Avatar, AvatarFallback } from '@/components/ui/avatar'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { InteractiveRow } from '@/components/ui/interactive-row'
import { getProjectKnowledgeFn } from '@/lib/server'
import {
  KNOWLEDGE_TYPES,
  KNOWLEDGE_TYPE_BG_CLASS as K_BG_CLASS,
  KNOWLEDGE_TYPE_DOT_CLASS as K_DOT_CLASS,
  KNOWLEDGE_TYPE_HINT,
  KNOWLEDGE_TYPE_LABEL,
  KNOWLEDGE_TYPE_PREFIX,
  KNOWLEDGE_TYPE_TEXT_CLASS as K_TEXT_CLASS,
} from '@/lib/knowledge'
import { mapStatus } from '@/lib/types'
import { PRIORITY_TEXT_CLASS } from '@/lib/sort'
import { cn, initials } from '@/lib/utils'

import type { Bead, KnowledgeType, ProjectKnowledgeEntry } from '@/lib/types'

interface KnowledgeDetailModalProps {
  project: string
  knowledgeId: string | null
  open: boolean
  onOpenChange: (open: boolean) => void
  beadsById: Map<string, Bead>
  onOpenBead: (bead: Bead) => void
  onOpenKnowledge: (id: string) => void
}

const DOT_CLASS: Record<string, string> = {
  open: 'bg-status-open',
  in_progress: 'bg-status-progress',
  blocked: 'bg-status-blocked',
  closed: 'bg-status-closed',
}

function relativeDate(value?: string): string {
  if (!value) return ''
  const parsed = new Date(value)
  if (Number.isNaN(parsed.getTime())) return ''
  return formatDistanceToNow(parsed, { addSuffix: true, locale: enUS })
}

function KTag({ type }: { type: KnowledgeType }) {
  return (
    <span
      className={cn(
        'inline-flex items-center gap-[5px] rounded-[4px] px-1.5 py-0.5 font-mono text-[10px] font-semibold tracking-[0.08em] uppercase',
        K_BG_CLASS[type],
        K_TEXT_CLASS[type],
      )}
    >
      <span
        className={cn('size-[5px] shrink-0 rounded-full', K_DOT_CLASS[type])}
        aria-hidden="true"
      />
      {KNOWLEDGE_TYPE_LABEL[type]}
    </span>
  )
}

function KRow({
  entry,
  active,
  onOpen,
}: {
  entry: ProjectKnowledgeEntry
  active?: boolean
  onOpen: () => void
}) {
  return (
    <InteractiveRow
      size="cozy"
      onClick={onOpen}
      disabled={active}
      active={active}
    >
      <span
        className={cn(
          'w-0.5 shrink-0 self-stretch rounded-full',
          K_DOT_CLASS[entry.type],
        )}
        aria-hidden="true"
      />
      <div className="min-w-0 flex-1">
        <KTag type={entry.type} />
        <p className="mt-1.5 line-clamp-2 text-[12.75px] leading-[1.58] text-foreground/90">
          {entry.content}
        </p>
      </div>
    </InteractiveRow>
  )
}

export function KnowledgeDetailModal({
  project,
  knowledgeId,
  open,
  onOpenChange,
  beadsById,
  onOpenBead,
  onOpenKnowledge,
}: KnowledgeDetailModalProps) {
  const query = useQuery({
    queryKey: ['project-knowledge', project],
    queryFn: () => getProjectKnowledgeFn({ data: { project } }),
    staleTime: 4000,
  })

  const knowledge = query.data?.knowledge ?? []
  const entry = knowledgeId
    ? (knowledge.find((k) => k.id === knowledgeId) ?? null)
    : null
  const bead = entry ? beadsById.get(entry.bead_id) : undefined
  const beadColumn = bead ? mapStatus(bead.status).column : null
  const beadPriority = bead ? Math.max(0, Math.min(4, bead.priority)) : null

  const sameBead = entry
    ? knowledge.filter((k) => k.bead_id === entry.bead_id && k.id !== entry.id)
    : []
  const sameType = entry
    ? knowledge.filter((k) => k.type === entry.type && k.id !== entry.id)
    : []
  const typeCounts = new Map<KnowledgeType, number>()
  for (const k of knowledge)
    typeCounts.set(k.type, (typeCounts.get(k.type) ?? 0) + 1)
  const firstOfType = new Map<KnowledgeType, string>()
  for (const k of knowledge)
    if (!firstOfType.has(k.type)) firstOfType.set(k.type, k.id)

  function copyRaw() {
    if (!entry) return
    navigator.clipboard
      .writeText(entry.text)
      .then(() => toast.success('Comment copied'))
      .catch(() => toast.error('Could not copy to clipboard'))
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="grid max-h-[86vh] w-[94vw] max-w-3xl grid-cols-1 grid-rows-[minmax(0,1fr)] gap-0 overflow-hidden rounded-[14px] bg-background p-0 shadow-pop sm:max-w-3xl lg:max-w-[1080px] lg:grid-cols-[minmax(0,1fr)_268px]">
        {query.isLoading ? (
          <>
            <DialogTitle className="sr-only">
              Loading knowledge entry
            </DialogTitle>
            <DialogDescription className="sr-only">
              Loading knowledge entry details
            </DialogDescription>
            <div className="flex h-48 items-center justify-center">
              <Loader2
                className="size-5 animate-spin text-muted-foreground"
                aria-hidden="true"
              />
            </div>
          </>
        ) : entry ? (
          <>
            <div className="flex min-h-0 min-w-0 flex-col">
              <div className="border-b border-border bg-canvas px-[22px] pt-4 pb-3.5">
                <div className="flex flex-wrap items-center gap-1.5 pr-16">
                  <KTag type={entry.type} />
                  <span className="font-mono text-xs text-muted-foreground">
                    {entry.id}
                  </span>
                  <div className="ml-auto flex shrink-0 items-center gap-1.5">
                    <Button size="sm" variant="outline" onClick={copyRaw}>
                      <Copy className="size-3.5" aria-hidden="true" />
                      Copy raw
                    </Button>
                    {bead ? (
                      <Button
                        size="sm"
                        variant="ghost"
                        onClick={() => onOpenBead(bead)}
                      >
                        <CornerDownRight
                          className="size-3.5"
                          aria-hidden="true"
                        />
                        Open bead
                      </Button>
                    ) : null}
                    <Button
                      size="sm"
                      variant="ghost"
                      onClick={() => onOpenChange(false)}
                      aria-label="Close knowledge entry"
                    >
                      <X className="size-3.5" aria-hidden="true" />
                    </Button>
                  </div>
                </div>

                <DialogTitle className="mt-2.5 text-[20px] leading-[1.28] font-semibold tracking-[-0.015em] text-balance">
                  {entry.content}
                </DialogTitle>
                <DialogDescription className="sr-only">
                  Knowledge entry recorded on {entry.bead_id}
                </DialogDescription>

                <Button
                  variant="link"
                  onClick={() => bead && onOpenBead(bead)}
                  disabled={!bead}
                  className="mt-2 h-auto w-fit max-w-full gap-1.5 p-0 text-xs text-muted-foreground"
                >
                  <CornerDownRight
                    className="size-3 shrink-0"
                    aria-hidden="true"
                  />
                  Recorded on
                  <span className="font-mono">{entry.bead_id}</span>
                  <span className="truncate">{entry.bead_title}</span>
                </Button>
              </div>

              <div className="min-h-0 flex-1 overflow-y-auto px-[22px] py-[22px]">
                <div className="flex flex-col gap-[26px]">
                  <section>
                    <div className="mb-2.5 flex items-center gap-1.5 text-muted-foreground">
                      <BookOpen className="size-3.5" aria-hidden="true" />
                      <h3 className="font-mono text-[10.5px] font-medium tracking-[0.09em] uppercase">
                        Comment as stored, in full
                      </h3>
                      <span className="ml-auto font-mono text-[11px] tabular-nums text-faint">
                        {relativeDate(entry.created_at)}
                      </span>
                    </div>
                    <div className="rounded-[9px] bg-canvas px-3 py-2.5 text-[13px] leading-[1.6] ring-1 ring-inset ring-border">
                      <b className={K_TEXT_CLASS[entry.type]}>
                        {KNOWLEDGE_TYPE_PREFIX[entry.type]}:
                      </b>{' '}
                      {entry.content}
                    </div>
                    <p className="mt-2 text-[11.5px] leading-[1.55] text-faint">
                      bd has no knowledge entity — this is an ordinary bead
                      comment. The board promotes it because the text opens with
                      a recognised prefix, matched case-insensitively.
                    </p>
                  </section>

                  <section>
                    <div className="mb-2.5 flex items-center gap-1.5 text-muted-foreground">
                      <CornerDownRight
                        className="size-3.5"
                        aria-hidden="true"
                      />
                      <h3 className="font-mono text-[10.5px] font-medium tracking-[0.09em] uppercase">
                        Source bead
                      </h3>
                    </div>
                    {bead && beadColumn !== null && beadPriority !== null ? (
                      <InteractiveRow onClick={() => onOpenBead(bead)}>
                        <span
                          className={cn(
                            'size-2 shrink-0 rounded-full',
                            DOT_CLASS[beadColumn],
                          )}
                          aria-hidden="true"
                        />
                        <span className="font-mono text-[11px] text-muted-foreground">
                          {bead.id}
                        </span>
                        <span className="truncate text-[12.75px]">
                          {bead.title}
                        </span>
                        <span
                          className={cn(
                            'ml-auto shrink-0 rounded-[4px] px-1 py-px font-mono text-[10px] font-semibold tabular-nums ring-1 ring-inset ring-current',
                            PRIORITY_TEXT_CLASS[beadPriority],
                          )}
                        >
                          P{beadPriority}
                        </span>
                      </InteractiveRow>
                    ) : (
                      <p className="text-xs text-muted-foreground/70">
                        Source bead no longer exists.
                      </p>
                    )}
                  </section>

                  {sameBead.length > 0 ? (
                    <section>
                      <div className="mb-2.5 flex items-center gap-1.5 text-muted-foreground">
                        <BookOpen className="size-3.5" aria-hidden="true" />
                        <h3 className="font-mono text-[10.5px] font-medium tracking-[0.09em] uppercase">
                          Also recorded on this bead
                        </h3>
                        <span className="ml-auto font-mono text-[11px] tabular-nums text-faint">
                          {sameBead.length}
                        </span>
                      </div>
                      <div className="flex flex-col gap-1.5">
                        {sameBead.map((k) => (
                          <KRow
                            key={k.id}
                            entry={k}
                            onOpen={() => onOpenKnowledge(k.id)}
                          />
                        ))}
                      </div>
                    </section>
                  ) : null}

                  {sameType.length > 0 ? (
                    <section>
                      <div className="mb-2.5 flex items-center gap-1.5 text-muted-foreground">
                        <Layers className="size-3.5" aria-hidden="true" />
                        <h3 className="font-mono text-[10.5px] font-medium tracking-[0.09em] uppercase">
                          Other {KNOWLEDGE_TYPE_LABEL[entry.type].toLowerCase()}{' '}
                          entries
                        </h3>
                        <span className="ml-auto font-mono text-[11px] tabular-nums text-faint">
                          {sameType.length}
                        </span>
                      </div>
                      <div className="flex flex-col gap-1.5">
                        {sameType.map((k) => (
                          <KRow
                            key={k.id}
                            entry={k}
                            onOpen={() => onOpenKnowledge(k.id)}
                          />
                        ))}
                      </div>
                    </section>
                  ) : null}
                </div>
              </div>
            </div>

            <div className="flex min-h-0 flex-col overflow-y-auto border-t border-border bg-sidebar p-[18px] lg:border-t-0 lg:border-l">
              <div className="flex flex-col">
                <span className="mb-[7px] block font-mono text-[10px] font-medium tracking-[0.09em] text-faint uppercase">
                  Type
                </span>
                <KTag type={entry.type} />
                <p className="mt-[7px] text-[11.5px] leading-[1.55] text-faint">
                  {KNOWLEDGE_TYPE_HINT[entry.type]}
                </p>
              </div>

              <div className="mt-4 flex flex-col">
                <span className="mb-[7px] block font-mono text-[10px] font-medium tracking-[0.09em] text-faint uppercase">
                  Recorded by
                </span>
                <div className="flex items-center gap-1.5 text-[13px]">
                  <Avatar size="sm" className="size-[19px] bg-white/9">
                    <AvatarFallback className="bg-transparent text-[9px] font-semibold text-foreground">
                      {initials(entry.author ?? '?')}
                    </AvatarFallback>
                  </Avatar>
                  <span className="min-w-0 truncate">
                    {entry.author ?? 'Anonymous'}
                  </span>
                </div>
              </div>

              <div className="mt-4 flex flex-col">
                <span className="mb-[7px] block font-mono text-[10px] font-medium tracking-[0.09em] text-faint uppercase">
                  When
                </span>
                <span className="font-mono text-[12.5px] text-muted-foreground">
                  {relativeDate(entry.created_at)}
                </span>
              </div>

              {bead && beadColumn !== null && beadPriority !== null ? (
                <div className="mt-4 flex flex-col">
                  <span className="mb-[7px] block font-mono text-[10px] font-medium tracking-[0.09em] text-faint uppercase">
                    Source bead
                  </span>
                  <div className="flex items-center gap-1.5 text-[12.5px]">
                    <span
                      className={cn(
                        'size-2 shrink-0 rounded-full',
                        DOT_CLASS[beadColumn],
                      )}
                      aria-hidden="true"
                    />
                    <span className="font-mono">{bead.id}</span>
                    <span
                      className={cn(
                        'ml-auto rounded-[4px] px-1 py-px font-mono text-[10px] font-semibold tabular-nums ring-1 ring-inset ring-current',
                        PRIORITY_TEXT_CLASS[beadPriority],
                      )}
                    >
                      P{beadPriority}
                    </span>
                  </div>
                </div>
              ) : null}

              {bead?.labels && bead.labels.length > 0 ? (
                <div className="mt-4 flex flex-col">
                  <span className="mb-[7px] block font-mono text-[10px] font-medium tracking-[0.09em] text-faint uppercase">
                    Bead labels
                  </span>
                  <span className="flex flex-wrap gap-1.5">
                    {bead.labels.map((label) => (
                      <span
                        key={label}
                        className="max-w-[92px] truncate rounded-[4px] px-[5px] text-[10.5px] leading-[1.6] text-muted-foreground ring-1 ring-inset ring-border-strong"
                      >
                        {label}
                      </span>
                    ))}
                  </span>
                </div>
              ) : null}

              <hr className="my-4 border-border" />

              <div className="flex flex-col">
                <span className="mb-[7px] block font-mono text-[10px] font-medium tracking-[0.09em] text-faint uppercase">
                  Prefix
                </span>
                <span
                  className={cn(
                    'font-mono text-[12.5px]',
                    K_TEXT_CLASS[entry.type],
                  )}
                >
                  {KNOWLEDGE_TYPE_PREFIX[entry.type]}:
                </span>
              </div>

              <div className="mt-4 flex flex-col">
                <span className="mb-[7px] block font-mono text-[10px] font-medium tracking-[0.09em] text-faint uppercase">
                  All types
                </span>
                <div className="flex flex-wrap gap-1.5">
                  {KNOWLEDGE_TYPES.map((t) => {
                    const target = firstOfType.get(t)
                    const isCurrent = t === entry.type
                    return (
                      <Badge
                        key={t}
                        variant="outline"
                        disabled={!target || isCurrent}
                        onClick={() => target && onOpenKnowledge(target)}
                        title={`${KNOWLEDGE_TYPE_LABEL[t]} · ${typeCounts.get(t) ?? 0}`}
                        className={cn(
                          'border-transparent font-mono text-[10px] tracking-[0.08em] uppercase disabled:pointer-events-none disabled:opacity-100',
                          K_BG_CLASS[t],
                          K_TEXT_CLASS[t],
                          isCurrent && 'ring-1 ring-inset ring-current',
                        )}
                      >
                        <span
                          className={cn(
                            'size-[5px] shrink-0 rounded-full',
                            K_DOT_CLASS[t],
                          )}
                          aria-hidden="true"
                        />
                        {KNOWLEDGE_TYPE_LABEL[t]} {typeCounts.get(t) ?? 0}
                      </Badge>
                    )
                  })}
                </div>
              </div>

              <hr className="my-4 border-border" />

              <span className="mb-[7px] block font-mono text-[10px] font-medium tracking-[0.09em] text-faint uppercase">
                Written with
              </span>
              <p className="rounded-[7px] bg-black/35 px-[11px] py-[9px] font-mono text-[11.5px] leading-[1.55] text-muted-foreground ring-1 ring-inset ring-border">
                bd comment {entry.bead_id} &quot;
                {KNOWLEDGE_TYPE_PREFIX[entry.type]}: …&quot;
              </p>
              <span className="mt-3.5 mb-[7px] block font-mono text-[10px] font-medium tracking-[0.09em] text-faint uppercase">
                Read back with
              </span>
              <p className="rounded-[7px] bg-black/35 px-[11px] py-[9px] font-mono text-[11.5px] leading-[1.55] text-muted-foreground ring-1 ring-inset ring-border">
                bd show {entry.bead_id} --json
              </p>
            </div>
          </>
        ) : (
          <>
            <DialogTitle className="sr-only">
              Knowledge entry not found
            </DialogTitle>
            <DialogDescription className="sr-only">
              This knowledge entry could not be found
            </DialogDescription>
            <div className="flex h-48 items-center justify-center text-sm text-muted-foreground">
              This knowledge entry could not be found.
            </div>
          </>
        )}
      </DialogContent>
    </Dialog>
  )
}
