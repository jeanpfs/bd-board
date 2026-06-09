import { useMemo, useState } from 'react'
import { useDroppable } from '@dnd-kit/core'
import { SortableContext, verticalListSortingStrategy } from '@dnd-kit/sortable'

import { BeadCard } from '@/components/bead-card'
import { Button } from '@/components/ui/button'
import { ScrollArea } from '@/components/ui/scroll-area'
import { cn } from '@/lib/utils'

import type { Bead, BeadColumn } from '@/lib/types'

interface KanbanColumnProps {
  column: BeadColumn
  label: string
  beads: Bead[]
  onOpen: (bead: Bead) => void
  initialLimit?: number
}

const DOT_CLASS: Record<BeadColumn, string> = {
  open: 'bg-status-open',
  in_progress: 'bg-status-progress',
  blocked: 'bg-status-blocked',
  closed: 'bg-status-closed',
}

const ACCENT_CLASS: Record<BeadColumn, string> = {
  open: 'text-status-open',
  in_progress: 'text-status-progress',
  blocked: 'text-status-blocked',
  closed: 'text-status-closed',
}

export function KanbanColumn({
  column,
  label,
  beads,
  onOpen,
  initialLimit = 40,
}: KanbanColumnProps) {
  const [expanded, setExpanded] = useState(false)
  const { setNodeRef, isOver } = useDroppable({ id: column })

  const visible = useMemo(
    () => (expanded ? beads : beads.slice(0, initialLimit)),
    [beads, expanded, initialLimit],
  )
  const hidden = beads.length - visible.length
  const ids = useMemo(() => visible.map((b) => b.id), [visible])

  return (
    <div className="flex h-full min-h-0 min-w-0 flex-col">
      <div className="flex items-center gap-2 px-1 pb-2">
        <span
          className={cn('size-2 shrink-0 rounded-full', DOT_CLASS[column])}
          aria-hidden="true"
        />
        <h2 className="text-sm font-medium tracking-tight text-foreground">
          {label}
        </h2>
        <span className={cn('text-xs tabular-nums', ACCENT_CLASS[column])}>
          {beads.length}
        </span>
      </div>

      <div
        ref={setNodeRef}
        className={cn(
          'flex min-h-0 flex-1 flex-col rounded-xl bg-muted/30 ring-1 ring-inset ring-foreground/5 transition-colors',
          isOver && 'bg-primary/5 ring-primary/30',
        )}
      >
        {beads.length === 0 ? (
          <div className="flex flex-1 items-center justify-center p-4">
            <span className="text-xs text-muted-foreground/60">Vazio</span>
          </div>
        ) : (
          <ScrollArea className="min-h-0 flex-1">
            <div className="flex flex-col gap-2 p-2">
              <SortableContext
                items={ids}
                strategy={verticalListSortingStrategy}
              >
                {visible.map((bead) => (
                  <BeadCard key={bead.id} bead={bead} onOpen={onOpen} />
                ))}
              </SortableContext>

              {hidden > 0 ? (
                <Button
                  variant="ghost"
                  size="sm"
                  className="mt-1 w-full text-muted-foreground"
                  onClick={() => setExpanded(true)}
                >
                  Mostrar mais ({hidden})
                </Button>
              ) : null}
            </div>
          </ScrollArea>
        )}
      </div>
    </div>
  )
}
