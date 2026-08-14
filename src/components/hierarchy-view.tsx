import { useMemo, useState } from 'react'
import { ChevronDown, ChevronRight, Layers } from 'lucide-react'

import { Button } from '@/components/ui/button'
import { InteractiveRow } from '@/components/ui/interactive-row'
import { cn } from '@/lib/utils'
import { isEpic, mapStatus } from '@/lib/types'
import { PRIORITY_TEXT_CLASS, compareBeads } from '@/lib/sort'
import { buildChildrenMap, getRootBeads } from '@/lib/tree'

import type { Bead, BeadColumn } from '@/lib/types'

interface HierarchyViewProps {
  beads: Bead[]
  onOpen: (bead: Bead) => void
}

const STATUS_DOT_CLASS: Record<BeadColumn, string> = {
  open: 'bg-status-open',
  in_progress: 'bg-status-progress',
  blocked: 'bg-status-blocked',
  closed: 'bg-status-closed',
}

function TreeNode({
  bead,
  depth,
  childrenMap,
  onOpen,
}: {
  bead: Bead
  depth: number
  childrenMap: Map<string, Bead[]>
  onOpen: (bead: Bead) => void
}) {
  const children = childrenMap.get(bead.id) ?? []
  const hasChildren = children.length > 0
  const [open, setOpen] = useState(true)
  const priority = Math.max(0, Math.min(4, bead.priority))
  const epic = isEpic(bead)

  return (
    <div>
      <div
        className="flex items-center gap-2 rounded-[7px] py-1.5 pr-2 transition-colors hover:bg-card-hover"
        style={{ paddingLeft: 6 + depth * 18 }}
      >
        {hasChildren ? (
          <Button
            type="button"
            variant="ghost"
            size="icon-xs"
            onClick={() => setOpen((v) => !v)}
            aria-expanded={open}
            aria-label={open ? 'Collapse' : 'Expand'}
            className="shrink-0 text-muted-foreground"
          >
            {open ? (
              <ChevronDown className="size-3.5" aria-hidden="true" />
            ) : (
              <ChevronRight className="size-3.5" aria-hidden="true" />
            )}
          </Button>
        ) : (
          <span className="size-6 shrink-0" aria-hidden="true" />
        )}

        <InteractiveRow
          variant="plain"
          size="flush"
          onClick={() => onOpen(bead)}
          className="flex min-w-0 flex-1 items-center gap-2"
        >
          <span
            className={cn(
              'size-1.5 shrink-0 rounded-full',
              STATUS_DOT_CLASS[mapStatus(bead.status).column],
            )}
            aria-hidden="true"
          />
          <span className="shrink-0 font-mono text-[11px] text-muted-foreground">
            {bead.id}
          </span>
          <span
            className={cn(
              'shrink-0 rounded-[4px] px-1 py-px font-mono text-[10px] font-semibold tabular-nums ring-1 ring-inset ring-current',
              PRIORITY_TEXT_CLASS[priority],
            )}
          >
            P{priority}
          </span>
          {epic ? (
            <span className="inline-flex shrink-0 items-center gap-1 rounded-[4px] bg-primary/30 px-1.5 py-px text-[10px] font-semibold tracking-[0.06em] text-primary-text uppercase ring-1 ring-inset ring-ring/45">
              <Layers className="size-2.5" aria-hidden="true" />
              Epic
            </span>
          ) : null}
          <span className="truncate text-[12.75px] text-foreground">
            {bead.title}
          </span>
          {hasChildren ? (
            <span className="ml-auto shrink-0 font-mono text-[10.5px] tabular-nums text-faint">
              {children.length}
            </span>
          ) : null}
        </InteractiveRow>
      </div>

      {hasChildren && open ? (
        <div>
          {children.map((child) => (
            <TreeNode
              key={child.id}
              bead={child}
              depth={depth + 1}
              childrenMap={childrenMap}
              onOpen={onOpen}
            />
          ))}
        </div>
      ) : null}
    </div>
  )
}

export function HierarchyView({ beads, onOpen }: HierarchyViewProps) {
  const childrenMap = useMemo(() => buildChildrenMap(beads), [beads])
  const roots = useMemo(
    () => [...getRootBeads(beads)].sort(compareBeads('priority')),
    [beads],
  )

  if (roots.length === 0) {
    return (
      <div className="flex flex-1 items-center justify-center">
        <span className="text-sm text-muted-foreground/60">
          No beads in this project
        </span>
      </div>
    )
  }

  return (
    <div className="min-h-0 flex-1 overflow-y-auto pt-2 pb-4">
      <div className="flex flex-col gap-0.5">
        {roots.map((root) => (
          <TreeNode
            key={root.id}
            bead={root}
            depth={0}
            childrenMap={childrenMap}
            onOpen={onOpen}
          />
        ))}
      </div>
    </div>
  )
}
