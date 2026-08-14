import { useMemo, useState } from 'react'
import { useQuery } from '@tanstack/react-query'
import { formatDistanceToNow } from 'date-fns'
import { enUS } from 'date-fns/locale'
import {
  AlertTriangle,
  BookOpen,
  Filter,
  MessageSquare,
  Search,
} from 'lucide-react'

import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'
import { Skeleton } from '@/components/ui/skeleton'
import { getProjectKnowledgeFn } from '@/lib/server'
import { KNOWLEDGE_TYPE_LABEL, KNOWLEDGE_TYPES } from '@/lib/knowledge'
import { cn } from '@/lib/utils'

import type {
  Bead,
  KnowledgeType,
  ProjectComment,
  ProjectKnowledgeEntry,
} from '@/lib/types'
import type { LucideIcon } from 'lucide-react'

type TypeFilter = KnowledgeType | 'all'

interface ProjectKnowledgePanelProps {
  project: string
  beadsById: Map<string, Bead>
  onOpenBead: (bead: Bead) => void
}

const TYPE_BADGE: Record<KnowledgeType, string> = {
  learned: 'bg-k-learned/15 text-k-learned ring-1 ring-inset ring-k-learned/38',
  decision:
    'bg-k-decision/15 text-k-decision ring-1 ring-inset ring-k-decision/38',
  fact: 'bg-k-fact/15 text-k-fact ring-1 ring-inset ring-k-fact/38',
  pattern: 'bg-k-pattern/15 text-k-pattern ring-1 ring-inset ring-k-pattern/38',
  investigation:
    'bg-k-investigation/15 text-k-investigation ring-1 ring-inset ring-k-investigation/38',
  'must-check':
    'bg-k-must-check/15 text-k-must-check ring-1 ring-inset ring-k-must-check/38',
  deviation:
    'bg-k-deviation/15 text-k-deviation ring-1 ring-inset ring-k-deviation/38',
}

const KNOWLEDGE_DOT: Record<KnowledgeType, string> = {
  learned: 'bg-k-learned',
  decision: 'bg-k-decision',
  fact: 'bg-k-fact',
  pattern: 'bg-k-pattern',
  investigation: 'bg-k-investigation',
  'must-check': 'bg-k-must-check',
  deviation: 'bg-k-deviation',
}

function relativeDate(value?: string): string {
  if (!value) return ''
  const parsed = new Date(value)
  if (Number.isNaN(parsed.getTime())) return ''
  return formatDistanceToNow(parsed, { addSuffix: true, locale: enUS })
}

function matchesText(
  value: ProjectKnowledgeEntry | ProjectComment,
  query: string,
): boolean {
  if (!query) return true
  const haystack = [
    value.text,
    value.bead_id,
    value.bead_title,
    value.author,
    'content' in value ? value.content : undefined,
  ]
    .filter(Boolean)
    .join(' ')
    .toLowerCase()
  return haystack.includes(query.toLowerCase())
}

function TypeBadge({ type }: { type: KnowledgeType }) {
  return (
    <Badge
      variant="outline"
      className={cn(
        'border-transparent font-mono text-[10px] tracking-[0.08em] uppercase',
        TYPE_BADGE[type],
      )}
    >
      {KNOWLEDGE_TYPE_LABEL[type]}
    </Badge>
  )
}

function OpenBeadButton({
  bead,
  beadId,
  onOpenBead,
}: {
  bead?: Bead
  beadId: string
  onOpenBead: (bead: Bead) => void
}) {
  return (
    <Button
      type="button"
      variant="ghost"
      size="sm"
      className="h-6 px-1.5 font-mono text-[0.7rem] text-muted-foreground hover:text-foreground"
      disabled={!bead}
      onClick={() => bead && onOpenBead(bead)}
    >
      {beadId}
    </Button>
  )
}

export function ProjectKnowledgePanel({
  project,
  beadsById,
  onOpenBead,
}: ProjectKnowledgePanelProps) {
  const [search, setSearch] = useState('')
  const [type, setType] = useState<TypeFilter>('all')

  const query = useQuery({
    queryKey: ['project-knowledge', project],
    queryFn: () => getProjectKnowledgeFn({ data: { project } }),
    refetchInterval: 12000,
    staleTime: 4000,
  })

  const knowledge = query.data?.knowledge ?? []
  const comments = query.data?.comments ?? []
  const normalizedSearch = search.trim()

  const filteredKnowledge = useMemo(
    () =>
      knowledge.filter(
        (entry) =>
          (type === 'all' || entry.type === type) &&
          matchesText(entry, normalizedSearch),
      ),
    [knowledge, normalizedSearch, type],
  )

  const filteredComments = useMemo(
    () => comments.filter((comment) => matchesText(comment, normalizedSearch)),
    [comments, normalizedSearch],
  )

  const typeCounts = useMemo(() => {
    const counts = new Map<KnowledgeType, number>()
    for (const entry of knowledge) {
      counts.set(entry.type, (counts.get(entry.type) ?? 0) + 1)
    }
    return counts
  }, [knowledge])

  if (query.isLoading) {
    return <KnowledgeSkeleton />
  }

  if (query.isError) {
    return (
      <div className="flex flex-1 items-center justify-center rounded-lg border border-destructive/30 bg-destructive/5 px-6 py-8 text-center">
        <div className="flex max-w-sm flex-col items-center gap-3">
          <AlertTriangle
            className="size-5 text-destructive"
            aria-hidden="true"
          />
          <p className="text-sm text-muted-foreground">
            {query.error instanceof Error
              ? query.error.message
              : 'Failed to load knowledge'}
          </p>
          <Button variant="outline" size="sm" onClick={() => query.refetch()}>
            Try again
          </Button>
        </div>
      </div>
    )
  }

  return (
    <div className="flex min-h-0 flex-1 flex-col gap-3">
      <div className="flex flex-wrap items-center gap-2 rounded-[8px] bg-canvas px-3 py-2 ring-1 ring-inset ring-border">
        <div className="relative min-w-56 flex-1 sm:max-w-md">
          <Search
            className="pointer-events-none absolute top-1/2 left-2.5 size-3.5 -translate-y-1/2 text-muted-foreground"
            aria-hidden="true"
          />
          <Input
            value={search}
            onChange={(event) => setSearch(event.target.value)}
            placeholder="Search knowledge and comments..."
            className="h-8 pl-8"
            aria-label="Search knowledge and comments"
          />
        </div>

        <div className="flex items-center gap-2">
          <Filter className="size-3.5 text-muted-foreground" />
          <Select
            value={type}
            onValueChange={(value) => setType(value as TypeFilter)}
          >
            <SelectTrigger size="sm" className="h-8 w-44">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">All types</SelectItem>
              {KNOWLEDGE_TYPES.map((item) => (
                <SelectItem key={item} value={item}>
                  {KNOWLEDGE_TYPE_LABEL[item]}
                  {typeCounts.get(item) ? (
                    <span className="ml-1 text-xs text-muted-foreground">
                      {typeCounts.get(item)}
                    </span>
                  ) : null}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
      </div>

      <div className="grid min-h-0 flex-1 grid-cols-1 gap-3 xl:grid-cols-[minmax(0,1.18fr)_minmax(22rem,0.82fr)]">
        <section className="flex min-h-0 flex-col rounded-[10px] bg-canvas ring-1 ring-inset ring-border">
          <PanelHeader
            icon={BookOpen}
            title="Knowledge"
            count={filteredKnowledge.length}
          />
          <div className="min-h-0 flex-1 overflow-y-auto p-3">
            {filteredKnowledge.length === 0 ? (
              <EmptyState text="No structured comments." />
            ) : (
              <ul className="flex flex-col gap-2">
                {filteredKnowledge.map((entry) => {
                  const bead = beadsById.get(entry.bead_id)
                  return (
                    <li
                      key={entry.id}
                      className="flex gap-[11px] rounded-[9px] bg-card px-3 py-2.5 ring-1 ring-inset ring-border transition-colors hover:bg-card-hover"
                    >
                      <span
                        className={cn(
                          'w-0.5 shrink-0 self-stretch rounded-full',
                          KNOWLEDGE_DOT[entry.type],
                        )}
                        aria-hidden="true"
                      />
                      <div className="min-w-0 flex-1">
                        <div className="flex flex-wrap items-center gap-2">
                          <TypeBadge type={entry.type} />
                          <OpenBeadButton
                            bead={bead}
                            beadId={entry.bead_id}
                            onOpenBead={onOpenBead}
                          />
                          {entry.created_at ? (
                            <span className="text-[11.25px] text-faint">
                              {relativeDate(entry.created_at)}
                            </span>
                          ) : null}
                        </div>

                        <p className="mt-1.5 text-[12.75px] leading-[1.58] whitespace-pre-wrap text-foreground/90">
                          {entry.content}
                        </p>

                        {entry.bead_title ? (
                          <p className="mt-1.5 truncate text-[11.25px] text-faint">
                            {entry.bead_title}
                          </p>
                        ) : null}
                      </div>
                    </li>
                  )
                })}
              </ul>
            )}
          </div>
        </section>

        <section className="flex min-h-0 flex-col rounded-[10px] bg-canvas ring-1 ring-inset ring-border">
          <PanelHeader
            icon={MessageSquare}
            title="Comments"
            count={filteredComments.length}
          />
          <div className="min-h-0 flex-1 overflow-y-auto p-3">
            {filteredComments.length === 0 ? (
              <EmptyState text="No comments." />
            ) : (
              <ul className="flex flex-col gap-2">
                {filteredComments.map((comment) => {
                  const bead = beadsById.get(comment.bead_id)
                  return (
                    <li
                      key={comment.id}
                      className="rounded-[9px] bg-canvas px-3 py-2.5 ring-1 ring-inset ring-border"
                    >
                      <div className="flex flex-wrap items-center gap-2 text-[11.5px] text-faint">
                        {comment.knowledge_type ? (
                          <TypeBadge type={comment.knowledge_type} />
                        ) : null}
                        <OpenBeadButton
                          bead={bead}
                          beadId={comment.bead_id}
                          onOpenBead={onOpenBead}
                        />
                        {comment.author ? <span>{comment.author}</span> : null}
                        {comment.created_at ? (
                          <span>· {relativeDate(comment.created_at)}</span>
                        ) : null}
                      </div>
                      <p className="mt-1.5 text-[13px] whitespace-pre-wrap">
                        {comment.text}
                      </p>
                    </li>
                  )
                })}
              </ul>
            )}
          </div>
        </section>
      </div>
    </div>
  )
}

function PanelHeader({
  icon: Icon,
  title,
  count,
}: {
  icon: LucideIcon
  title: string
  count: number
}) {
  return (
    <header className="flex items-center gap-1.5 border-b border-border px-3 py-2 text-muted-foreground">
      <Icon className="size-3.5" aria-hidden="true" />
      <h2 className="font-mono text-[10.5px] font-medium tracking-[0.09em] uppercase">
        {title}
      </h2>
      <span className="ml-auto font-mono text-[11px] tabular-nums text-faint">
        {count}
      </span>
    </header>
  )
}

function EmptyState({ text }: { text: string }) {
  return (
    <div className="flex h-28 items-center justify-center rounded-md border border-dashed border-border/70 text-sm text-muted-foreground">
      {text}
    </div>
  )
}

function KnowledgeSkeleton() {
  return (
    <div className="grid min-h-0 flex-1 grid-cols-1 gap-3 xl:grid-cols-2">
      {[0, 1].map((index) => (
        <div
          key={index}
          className="flex min-h-0 flex-col rounded-[10px] bg-canvas ring-1 ring-inset ring-border p-3"
        >
          <Skeleton className="h-5 w-32" />
          <div className="mt-4 flex flex-col gap-2">
            <Skeleton className="h-20 w-full" />
            <Skeleton className="h-20 w-full" />
            <Skeleton className="h-20 w-full" />
          </div>
        </div>
      ))}
    </div>
  )
}
