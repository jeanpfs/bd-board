import { useMemo, useState } from 'react'
import { useQuery } from '@tanstack/react-query'
import { formatDistanceToNow } from 'date-fns'
import { ptBR } from 'date-fns/locale'
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
  learned: 'border-emerald-400/30 bg-emerald-400/10 text-emerald-200',
  decision: 'border-sky-400/30 bg-sky-400/10 text-sky-200',
  fact: 'border-violet-400/30 bg-violet-400/10 text-violet-200',
  pattern: 'border-amber-400/30 bg-amber-400/10 text-amber-200',
  investigation: 'border-cyan-400/30 bg-cyan-400/10 text-cyan-200',
  'must-check': 'border-red-400/40 bg-red-400/10 text-red-200',
  deviation: 'border-orange-400/40 bg-orange-400/10 text-orange-200',
}

function relativeDate(value?: string): string {
  if (!value) return ''
  const parsed = new Date(value)
  if (Number.isNaN(parsed.getTime())) return ''
  return formatDistanceToNow(parsed, { addSuffix: true, locale: ptBR })
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
    <Badge variant="outline" className={cn('capitalize', TYPE_BADGE[type])}>
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
              : 'Erro ao carregar knowledge'}
          </p>
          <Button variant="outline" size="sm" onClick={() => query.refetch()}>
            Tentar novamente
          </Button>
        </div>
      </div>
    )
  }

  return (
    <div className="flex min-h-0 flex-1 flex-col gap-3">
      <div className="flex flex-wrap items-center gap-2 rounded-lg border border-border/70 bg-card/60 px-3 py-2">
        <div className="relative min-w-56 flex-1 sm:max-w-md">
          <Search
            className="pointer-events-none absolute top-1/2 left-2.5 size-3.5 -translate-y-1/2 text-muted-foreground"
            aria-hidden="true"
          />
          <Input
            value={search}
            onChange={(event) => setSearch(event.target.value)}
            placeholder="Pesquisar knowledge e comentários..."
            className="h-8 pl-8"
            aria-label="Pesquisar knowledge e comentários"
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
              <SelectItem value="all">Todos os tipos</SelectItem>
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
        <section className="flex min-h-0 flex-col rounded-lg border border-border/70 bg-card/60">
          <PanelHeader
            icon={BookOpen}
            title="Knowledge"
            count={filteredKnowledge.length}
          />
          <div className="min-h-0 flex-1 overflow-y-auto p-3">
            {filteredKnowledge.length === 0 ? (
              <EmptyState text="Sem comentários estruturados." />
            ) : (
              <ul className="flex flex-col gap-2">
                {filteredKnowledge.map((entry) => {
                  const bead = beadsById.get(entry.bead_id)
                  return (
                    <li
                      key={entry.id}
                      className="rounded-lg border border-border/50 bg-background/35 px-3 py-2.5"
                    >
                      <div className="flex flex-wrap items-center gap-2">
                        <TypeBadge type={entry.type} />
                        <OpenBeadButton
                          bead={bead}
                          beadId={entry.bead_id}
                          onOpenBead={onOpenBead}
                        />
                        {entry.created_at ? (
                          <span className="text-xs text-muted-foreground">
                            {relativeDate(entry.created_at)}
                          </span>
                        ) : null}
                      </div>

                      <p className="mt-2 text-sm leading-relaxed whitespace-pre-wrap text-foreground/90">
                        {entry.content}
                      </p>

                      {entry.bead_title ? (
                        <p className="mt-2 truncate text-xs text-muted-foreground">
                          {entry.bead_title}
                        </p>
                      ) : null}
                    </li>
                  )
                })}
              </ul>
            )}
          </div>
        </section>

        <section className="flex min-h-0 flex-col rounded-lg border border-border/70 bg-card/60">
          <PanelHeader
            icon={MessageSquare}
            title="Comentários"
            count={filteredComments.length}
          />
          <div className="min-h-0 flex-1 overflow-y-auto p-3">
            {filteredComments.length === 0 ? (
              <EmptyState text="Sem comentários." />
            ) : (
              <ul className="flex flex-col gap-2">
                {filteredComments.map((comment) => {
                  const bead = beadsById.get(comment.bead_id)
                  return (
                    <li
                      key={comment.id}
                      className="rounded-lg bg-muted/30 px-3 py-2"
                    >
                      <div className="flex flex-wrap items-center gap-2">
                        {comment.knowledge_type ? (
                          <TypeBadge type={comment.knowledge_type} />
                        ) : null}
                        <OpenBeadButton
                          bead={bead}
                          beadId={comment.bead_id}
                          onOpenBead={onOpenBead}
                        />
                        {comment.author ? (
                          <span className="text-xs text-muted-foreground">
                            {comment.author}
                          </span>
                        ) : null}
                        {comment.created_at ? (
                          <span className="text-xs text-muted-foreground">
                            {relativeDate(comment.created_at)}
                          </span>
                        ) : null}
                      </div>
                      <p className="mt-1.5 text-sm whitespace-pre-wrap">
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
    <header className="flex items-center gap-2 border-b border-border/70 px-3 py-2">
      <Icon className="size-4 text-muted-foreground" aria-hidden="true" />
      <h2 className="text-sm font-semibold">{title}</h2>
      <span className="ml-auto rounded bg-muted px-1.5 py-0.5 text-xs tabular-nums text-muted-foreground">
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
          className="flex min-h-0 flex-col rounded-lg border border-border/70 bg-card/60 p-3"
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
