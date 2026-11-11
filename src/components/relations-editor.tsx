import { useMemo, useState } from 'react'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { toast } from 'sonner'
import { X } from 'lucide-react'

import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { InteractiveRow } from '@/components/ui/interactive-row'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'
import { addRelationFn, getBeads, removeRelationFn } from '@/lib/server'
import {
  isRelationKind,
  isRemovableRelation,
  relationCommandPreview,
} from '@/lib/relations'
import type {
  RelationGroups,
  RelationKind,
  RemovableRelationKind,
} from '@/lib/relations'
import type { Bead, RelatedBead } from '@/lib/types'
import { toErrorMessage } from '@/lib/utils'

const KIND_LABEL: Record<RelationKind, string> = {
  'blocked-by': 'Blocked by',
  blocks: 'Blocks',
  'relates-to': 'Related to',
  'duplicate-of': 'Duplicate of',
  supersedes: 'Supersedes',
}

const SUGGESTION_LIMIT = 6

interface RelationsEditorProps {
  project: string
  bead: Bead
  groups: RelationGroups
  onOpenBead: (bead: Bead) => void
}

interface RelationSectionSpec {
  label: string
  items: RelatedBead[]
  removableKind: (item: RelatedBead) => RemovableRelationKind | null
}

function removableKindOf(item: RelatedBead): RemovableRelationKind | null {
  return isRelationKind(item.dependency_type) &&
    isRemovableRelation(item.dependency_type)
    ? item.dependency_type
    : null
}

export function RelationsEditor({
  project,
  bead,
  groups,
  onOpenBead,
}: RelationsEditorProps) {
  const queryClient = useQueryClient()
  const [kind, setKind] = useState<RelationKind>('blocks')
  const [query, setQuery] = useState('')
  const [selectedId, setSelectedId] = useState<string | null>(null)

  const beadsQuery = useQuery({
    queryKey: ['beads', project],
    queryFn: () => getBeads({ data: { project } }),
    enabled: false,
  })
  const candidates = useMemo(() => beadsQuery.data ?? [], [beadsQuery.data])
  const beadById = useMemo(
    () => new Map(candidates.map((b) => [b.id, b])),
    [candidates],
  )

  const linkedIds = useMemo(
    () =>
      new Set(
        [...groups.blockedBy, ...groups.blocks, ...groups.related].map(
          (r) => r.id,
        ),
      ),
    [groups],
  )

  const suggestions = useMemo(() => {
    const q = query.trim().toLowerCase()
    if (!q) return []
    return candidates
      .filter(
        (b) =>
          b.id !== bead.id &&
          !linkedIds.has(b.id) &&
          (b.id.toLowerCase().includes(q) || b.title.toLowerCase().includes(q)),
      )
      .slice(0, SUGGESTION_LIMIT)
  }, [candidates, query, bead.id, linkedIds])

  const invalidate = (targetId: string) => {
    queryClient.invalidateQueries({ queryKey: ['beads', project] })
    queryClient.invalidateQueries({ queryKey: ['bead', project, bead.id] })
    queryClient.invalidateQueries({ queryKey: ['bead', project, targetId] })
  }

  const addMutation = useMutation({
    mutationFn: (target: string) =>
      addRelationFn({ data: { project, id: bead.id, kind, target } }),
    onSuccess: (_, target) => {
      toast.success(`Relation added to ${target}`)
      setSelectedId(null)
      setQuery('')
      invalidate(target)
    },
    onError: (error) => {
      toast.error(toErrorMessage(error, 'Failed to add relation'))
    },
  })

  const removeMutation = useMutation({
    mutationFn: (args: { kind: RemovableRelationKind; target: string }) =>
      removeRelationFn({
        data: { project, id: bead.id, kind: args.kind, target: args.target },
      }),
    onSuccess: (_, args) => {
      toast.success(`Relation to ${args.target} removed`)
      invalidate(args.target)
    },
    onError: (error) => {
      toast.error(toErrorMessage(error, 'Failed to remove relation'))
    },
  })

  const sections: RelationSectionSpec[] = [
    {
      label: 'Blocked by',
      items: groups.blockedBy,
      removableKind: () => 'blocked-by',
    },
    { label: 'Blocks', items: groups.blocks, removableKind: () => 'blocks' },
    {
      label: 'Related',
      items: groups.related,
      removableKind: removableKindOf,
    },
  ]
  const hasAny = sections.some((s) => s.items.length > 0)

  const selectedBead = selectedId ? beadById.get(selectedId) : undefined

  return (
    <div className="flex flex-col gap-4">
      {hasAny ? (
        sections
          .filter((s) => s.items.length > 0)
          .map((section) => (
            <div key={section.label} className="flex flex-col gap-1">
              <div className="flex items-baseline gap-2">
                <h3 className="text-body font-semibold">{section.label}</h3>
                <span className="text-xs text-faint">
                  {section.items.length}
                </span>
              </div>
              <ul className="flex flex-col">
                {section.items.map((item) => {
                  const removable = section.removableKind(item)
                  const target = beadById.get(item.id)
                  return (
                    <li
                      key={`${item.id}:${item.dependency_type}`}
                      className="flex items-center gap-1"
                    >
                      <InteractiveRow
                        variant="plain"
                        size="flush"
                        disabled={!target}
                        onClick={() => {
                          if (target) onOpenBead(target)
                        }}
                        className="min-h-row flex-1 border-t border-border px-3 py-2.5"
                      >
                        <span className="font-mono text-xs text-muted-foreground">
                          {item.id}
                        </span>
                        <span className="truncate text-body">{item.title}</span>
                        <span className="ml-auto flex shrink-0 items-center gap-2 text-xs text-muted-foreground">
                          {item.dependency_type !== 'relates-to' &&
                          item.dependency_type !== 'blocks' ? (
                            <span>{item.dependency_type}</span>
                          ) : null}
                          <span>{item.status}</span>
                        </span>
                      </InteractiveRow>
                      {removable ? (
                        <Button
                          variant="ghost"
                          size="icon-sm"
                          aria-label={`Remove relation to ${item.id}`}
                          disabled={removeMutation.isPending}
                          onClick={() =>
                            removeMutation.mutate({
                              kind: removable,
                              target: item.id,
                            })
                          }
                        >
                          <X className="size-3.5" aria-hidden="true" />
                        </Button>
                      ) : null}
                    </li>
                  )
                })}
              </ul>
            </div>
          ))
      ) : (
        <p className="text-xs text-muted-foreground">No relations yet.</p>
      )}

      <div className="flex flex-col gap-2 border-t border-border pt-3">
        <span className="text-body font-semibold">Add relation</span>
        <div className="flex gap-2">
          <Select
            value={kind}
            onValueChange={(value) => {
              if (isRelationKind(value)) setKind(value)
            }}
          >
            <SelectTrigger className="w-36" aria-label="Relation type">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {(Object.keys(KIND_LABEL) as RelationKind[]).map((k) => (
                <SelectItem key={k} value={k}>
                  {KIND_LABEL[k]}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
          <Input
            value={query}
            onChange={(event) => setQuery(event.target.value)}
            placeholder="Search bead id or title"
            aria-label="Search beads"
          />
          <Button
            disabled={!selectedId || addMutation.isPending}
            onClick={() => {
              if (selectedId) addMutation.mutate(selectedId)
            }}
          >
            Add
          </Button>
        </div>

        {suggestions.length > 0 ? (
          <ul className="flex flex-col">
            {suggestions.map((b) => (
              <li key={b.id}>
                <InteractiveRow
                  variant="plain"
                  size="flush"
                  active={b.id === selectedId}
                  aria-pressed={b.id === selectedId}
                  onClick={() => setSelectedId(b.id)}
                  className="min-h-row border-t border-border px-3 py-2"
                >
                  <span className="font-mono text-xs text-muted-foreground">
                    {b.id}
                  </span>
                  <span className="truncate text-body">{b.title}</span>
                </InteractiveRow>
              </li>
            ))}
          </ul>
        ) : query.trim() ? (
          <p className="text-xs text-muted-foreground">No matching beads.</p>
        ) : null}

        {selectedBead ? (
          <p className="font-mono text-xs text-muted-foreground">
            {relationCommandPreview(kind, bead.id, selectedBead.id)}
          </p>
        ) : null}
      </div>
    </div>
  )
}
