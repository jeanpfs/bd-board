import { useEffect, useMemo, useState } from 'react'
import { useMutation, useQueryClient } from '@tanstack/react-query'
import { toast } from 'sonner'

import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { InteractiveRow } from '@/components/ui/interactive-row'
import { Label } from '@/components/ui/label'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'
import { Textarea } from '@/components/ui/textarea'
import { addCommentFn } from '@/lib/server'
import {
  KNOWLEDGE_TYPES,
  KNOWLEDGE_TYPE_HINT,
  KNOWLEDGE_TYPE_LABEL,
  formatKnowledgeComment,
} from '@/lib/knowledge'
import { toErrorMessage } from '@/lib/utils'

import type { Bead, KnowledgeType } from '@/lib/types'

const SUGGESTION_LIMIT = 6

/**
 * bd has no knowledge store of its own: an entry is a bead comment that starts
 * with a type prefix, so every entry is filed against one bead.
 */
export function NewKnowledgeDialog({
  project,
  beads,
  open,
  onOpenChange,
}: {
  project: string
  beads: Bead[]
  open: boolean
  onOpenChange: (open: boolean) => void
}) {
  const queryClient = useQueryClient()
  const [type, setType] = useState<KnowledgeType>('decision')
  const [query, setQuery] = useState('')
  const [beadId, setBeadId] = useState<string | null>(null)
  const [content, setContent] = useState('')

  useEffect(() => {
    if (!open) return
    setType('decision')
    setQuery('')
    setBeadId(null)
    setContent('')
  }, [open])

  const suggestions = useMemo(() => {
    const q = query.trim().toLowerCase()
    if (!q) return []
    return beads
      .filter(
        (b) =>
          b.id.toLowerCase().includes(q) || b.title.toLowerCase().includes(q),
      )
      .slice(0, SUGGESTION_LIMIT)
  }, [beads, query])
  const selected = beadId ? beads.find((b) => b.id === beadId) : undefined

  const mutation = useMutation({
    mutationFn: (args: { id: string; text: string }) =>
      addCommentFn({ data: { project, id: args.id, text: args.text } }),
    onSuccess: (_, args) => {
      toast.success(`${KNOWLEDGE_TYPE_LABEL[type]} added to ${args.id}`)
      queryClient.invalidateQueries({
        queryKey: ['project-knowledge', project],
      })
      queryClient.invalidateQueries({ queryKey: ['bead', project, args.id] })
      onOpenChange(false)
    },
    onError: (error) => {
      toast.error(toErrorMessage(error, 'Failed to add knowledge entry'))
    },
  })

  const canSave = Boolean(selected) && content.trim().length > 0

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-lg">
        <DialogHeader>
          <DialogTitle>New knowledge entry</DialogTitle>
          <DialogDescription>
            Saved as a comment on the bead it belongs to.
          </DialogDescription>
        </DialogHeader>

        <form
          className="flex flex-col gap-4"
          onSubmit={(event) => {
            event.preventDefault()
            if (!selected || !canSave) return
            mutation.mutate({
              id: selected.id,
              text: formatKnowledgeComment(type, content),
            })
          }}
        >
          <div className="flex flex-col gap-1.5">
            <Label htmlFor="knowledge-type">Type</Label>
            <Select
              value={type}
              onValueChange={(value) => setType(value as KnowledgeType)}
            >
              <SelectTrigger id="knowledge-type" className="w-full">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {KNOWLEDGE_TYPES.map((item) => (
                  <SelectItem key={item} value={item}>
                    {KNOWLEDGE_TYPE_LABEL[item]}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
            <p className="text-xs text-muted-foreground">
              {KNOWLEDGE_TYPE_HINT[type]}
            </p>
          </div>

          <div className="flex flex-col gap-1.5">
            <Label htmlFor="knowledge-bead">Bead</Label>
            {selected ? (
              <div className="flex min-h-row items-center gap-2 rounded-md border border-border px-3 py-1.5">
                <span className="font-mono text-xs text-muted-foreground">
                  {selected.id}
                </span>
                <span className="min-w-0 flex-1 truncate text-body">
                  {selected.title}
                </span>
                <Button
                  type="button"
                  variant="ghost"
                  size="sm"
                  onClick={() => setBeadId(null)}
                >
                  Change
                </Button>
              </div>
            ) : (
              <>
                <Input
                  id="knowledge-bead"
                  value={query}
                  onChange={(event) => setQuery(event.target.value)}
                  placeholder="Search bead id or title"
                  autoComplete="off"
                />
                {suggestions.length > 0 ? (
                  <ul className="flex flex-col">
                    {suggestions.map((b) => (
                      <li key={b.id}>
                        <InteractiveRow
                          variant="plain"
                          size="flush"
                          onClick={() => setBeadId(b.id)}
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
                  <p className="text-xs text-muted-foreground">
                    No matching beads.
                  </p>
                ) : null}
              </>
            )}
          </div>

          <div className="flex flex-col gap-1.5">
            <Label htmlFor="knowledge-content">Entry</Label>
            <Textarea
              id="knowledge-content"
              value={content}
              onChange={(event) => setContent(event.target.value)}
              rows={4}
            />
          </div>

          <DialogFooter>
            <Button
              type="button"
              variant="ghost"
              onClick={() => onOpenChange(false)}
            >
              Cancel
            </Button>
            <Button type="submit" disabled={!canSave || mutation.isPending}>
              Save entry
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  )
}
