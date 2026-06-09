import { useSortable } from '@dnd-kit/sortable'
import { CSS } from '@dnd-kit/utilities'
import { GripVertical, Layers, MessageSquare } from 'lucide-react'

import { Badge } from '@/components/ui/badge'
import { Avatar, AvatarFallback } from '@/components/ui/avatar'
import { EpicProgress } from '@/components/epic-progress'
import { cn } from '@/lib/utils'
import { isEpic, mapStatus } from '@/lib/types'

import type { Bead } from '@/lib/types'

interface BeadCardProps {
  bead: Bead
  onOpen: (bead: Bead) => void
  overlay?: boolean
}

const PRIORITY_STYLES: Record<number, string> = {
  0: 'border-status-blocked/40 text-status-blocked',
  1: 'border-chart-4/40 text-chart-4',
  2: 'border-border text-muted-foreground',
  3: 'border-border text-muted-foreground/80',
  4: 'border-border text-muted-foreground/60',
}

const BADGE_TONES: Record<'warning' | 'muted' | 'info', string> = {
  warning: 'border-chart-4/40 bg-chart-4/10 text-chart-4',
  muted: 'border-border bg-muted text-muted-foreground',
  info: 'border-status-progress/40 bg-status-progress/10 text-status-progress',
}

function initials(name: string): string {
  const parts = name.trim().split(/[\s_@.-]+/).filter(Boolean)
  if (parts.length === 0) return '?'
  if (parts.length === 1) return parts[0]!.slice(0, 2).toUpperCase()
  return (parts[0]![0]! + parts[1]![0]!).toUpperCase()
}

export function BeadCard({ bead, onOpen, overlay = false }: BeadCardProps) {
  const {
    attributes,
    listeners,
    setNodeRef,
    transform,
    transition,
    isDragging,
  } = useSortable({ id: bead.id, data: { bead } })

  const epic = isEpic(bead)
  const badge = mapStatus(bead.status).badge
  const labels = bead.labels ?? []
  const childBeads = bead.childBeads ?? []
  const priority = Math.max(0, Math.min(4, bead.priority))

  const style = overlay
    ? undefined
    : { transform: CSS.Transform.toString(transform), transition }

  return (
    <div
      ref={overlay ? undefined : setNodeRef}
      style={style}
      className={cn(
        'group/card relative rounded-lg bg-card ring-1 ring-foreground/10 transition-colors hover:bg-accent/40 hover:ring-primary/30',
        epic && 'border-l-2 border-l-primary',
        isDragging && !overlay && 'opacity-40',
        overlay && 'shadow-lg ring-primary/40',
      )}
    >
      {!overlay ? (
        <span
          {...attributes}
          {...listeners}
          role="button"
          aria-label="Arrastar bead"
          className="absolute top-1.5 right-1.5 z-10 flex cursor-grab touch-none items-center rounded p-0.5 text-muted-foreground/30 opacity-0 transition-opacity group-hover/card:opacity-100 hover:text-muted-foreground active:cursor-grabbing"
        >
          <GripVertical className="size-3.5" aria-hidden="true" />
        </span>
      ) : null}

      <button
        type="button"
        onClick={() => onOpen(bead)}
        className="flex w-full cursor-pointer flex-col gap-2 rounded-lg p-2.5 text-left outline-none focus-visible:ring-2 focus-visible:ring-ring/60"
      >
        <span className="flex items-center gap-1.5 pr-5">
          <span className="font-mono text-[0.7rem] leading-none text-muted-foreground">
            {bead.id}
          </span>
          <span
            className={cn(
              'rounded border px-1 py-px text-[0.6rem] font-semibold leading-none tabular-nums',
              PRIORITY_STYLES[priority],
            )}
          >
            P{priority}
          </span>
          {epic ? (
            <span className="inline-flex items-center gap-1 rounded bg-primary/10 px-1.5 py-px text-[0.6rem] font-semibold uppercase tracking-wide text-primary ring-1 ring-inset ring-primary/25">
              <Layers className="size-2.5" aria-hidden="true" />
              Épico
            </span>
          ) : null}
          {badge ? (
            <span
              className={cn(
                'rounded border px-1.5 py-px text-[0.6rem] font-medium leading-none',
                BADGE_TONES[badge.tone],
              )}
            >
              {badge.label}
            </span>
          ) : null}
        </span>

        <span className="line-clamp-2 text-sm leading-snug text-foreground">
          {bead.title}
        </span>

        {epic ? <EpicProgress childBeads={childBeads} /> : null}

        <span className="flex items-center gap-2">
          {labels.slice(0, 3).map((label) => (
            <Badge
              key={label}
              variant="outline"
              className="h-4 max-w-[7rem] truncate px-1.5 text-[0.6rem] font-normal"
            >
              {label}
            </Badge>
          ))}

          <span className="ml-auto flex items-center gap-2 text-[0.7rem] text-muted-foreground">
            {bead.comment_count ? (
              <span className="inline-flex items-center gap-0.5 tabular-nums">
                <MessageSquare className="size-3" aria-hidden="true" />
                {bead.comment_count}
              </span>
            ) : null}
            {bead.assignee ? (
              <Avatar size="sm" className="size-5">
                <AvatarFallback className="text-[0.55rem]">
                  {initials(bead.assignee)}
                </AvatarFallback>
              </Avatar>
            ) : null}
          </span>
        </span>
      </button>
    </div>
  )
}
