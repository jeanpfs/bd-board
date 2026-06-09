import { useSortable } from '@dnd-kit/sortable'
import { CSS } from '@dnd-kit/utilities'
import { Layers, MessageSquare } from 'lucide-react'

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

function priorityLabel(priority: number): string {
  const p = Math.max(0, Math.min(4, priority))
  return `P${p}`
}

export function BeadCard({ bead, onOpen, overlay = false }: BeadCardProps) {
  const sortable = useSortable({ id: bead.id, data: { bead } })
  const {
    attributes,
    listeners,
    setNodeRef,
    transform,
    transition,
    isDragging,
  } = sortable

  const epic = isEpic(bead)
  const badge = mapStatus(bead.status).badge
  const labels = bead.labels ?? []
  const childBeads = bead.childBeads ?? []

  const style = overlay
    ? undefined
    : {
        transform: CSS.Transform.toString(transform),
        transition,
      }

  return (
    <div
      ref={overlay ? undefined : setNodeRef}
      style={style}
      {...(overlay ? {} : attributes)}
      {...(overlay ? {} : listeners)}
      onClick={() => onOpen(bead)}
      role="button"
      tabIndex={0}
      onKeyDown={(e) => {
        if (e.key === 'Enter' || e.key === ' ') {
          e.preventDefault()
          onOpen(bead)
        }
      }}
      className={cn(
        'group/card relative flex cursor-pointer flex-col gap-2 rounded-lg bg-card p-2.5 text-left ring-1 ring-foreground/10 transition-colors outline-none hover:bg-accent/40 hover:ring-primary/30 focus-visible:ring-2 focus-visible:ring-ring/60',
        epic && 'border-l-2 border-l-primary pl-2.5',
        isDragging && !overlay && 'opacity-40',
        overlay && 'cursor-grabbing shadow-lg ring-primary/40',
      )}
    >
      <div className="flex items-center gap-1.5">
        <span className="font-mono text-[0.7rem] leading-none text-muted-foreground">
          {bead.id}
        </span>
        <span
          className={cn(
            'rounded border px-1 py-px text-[0.6rem] font-semibold leading-none tabular-nums',
            PRIORITY_STYLES[Math.max(0, Math.min(4, bead.priority))],
          )}
        >
          {priorityLabel(bead.priority)}
        </span>
        {epic ? (
          <span className="ml-auto inline-flex items-center gap-1 rounded bg-primary/10 px-1.5 py-px text-[0.6rem] font-semibold uppercase tracking-wide text-primary ring-1 ring-inset ring-primary/25">
            <Layers className="size-2.5" aria-hidden="true" />
            Épico
          </span>
        ) : null}
        {badge ? (
          <span
            className={cn(
              'rounded border px-1.5 py-px text-[0.6rem] font-medium leading-none',
              epic ? '' : 'ml-auto',
              BADGE_TONES[badge.tone],
            )}
          >
            {badge.label}
          </span>
        ) : null}
      </div>

      <p className="line-clamp-2 text-sm leading-snug text-foreground">
        {bead.title}
      </p>

      {epic ? <EpicProgress childBeads={childBeads} /> : null}

      <div className="flex items-center gap-2">
        {labels.slice(0, 3).map((label) => (
          <Badge
            key={label}
            variant="outline"
            className="h-4 max-w-[7rem] truncate px-1.5 text-[0.6rem] font-normal"
          >
            {label}
          </Badge>
        ))}

        <div className="ml-auto flex items-center gap-2 text-[0.7rem] text-muted-foreground">
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
        </div>
      </div>
    </div>
  )
}
