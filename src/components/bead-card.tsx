import { useState } from 'react'
import { useSortable } from '@dnd-kit/sortable'
import { CSS } from '@dnd-kit/utilities'
import {
  Ban,
  ChevronDown,
  ChevronRight,
  GripVertical,
  Layers,
  Link2,
  ListTree,
  MessageSquare,
  Waypoints,
} from 'lucide-react'

import { Avatar, AvatarFallback } from '@/components/ui/avatar'
import { Button } from '@/components/ui/button'
import { InteractiveRow } from '@/components/ui/interactive-row'
import { SubtaskProgress } from '@/components/subtask-progress'
import { cn, initials } from '@/lib/utils'
import { groupBeadLinks, isEpic, mapStatus } from '@/lib/types'
import { PRIORITY_TEXT_CLASS } from '@/lib/sort'

import type { LucideIcon } from 'lucide-react'
import type { Bead, BeadColumn } from '@/lib/types'

interface BeadCardProps {
  bead: Bead
  onOpen: (bead: Bead) => void
  overlay?: boolean
  nested?: boolean
}

const BADGE_TONES: Record<'warning' | 'muted' | 'info', string> = {
  warning: 'bg-warn/16 text-warn',
  muted: 'bg-white/7 text-muted-foreground',
  info: 'bg-status-progress/18 text-status-progress',
}

const STATUS_DOT_CLASS: Record<BeadColumn, string> = {
  open: 'bg-status-open',
  in_progress: 'bg-status-progress',
  blocked: 'bg-status-blocked',
  closed: 'bg-status-closed',
}

function NestedChildren({
  childBeads,
  onOpen,
}: {
  childBeads: Bead[]
  onOpen: (bead: Bead) => void
}) {
  const [open, setOpen] = useState(false)

  return (
    <div className="border-t border-border px-[10px] pt-1.5 pb-2">
      <Button
        type="button"
        variant="ghost"
        onClick={() => setOpen((v) => !v)}
        aria-expanded={open}
        className="h-auto w-full justify-start gap-1.5 rounded px-0 py-1 font-mono text-[10.5px] tracking-[0.02em] text-faint hover:bg-transparent hover:text-muted-foreground"
      >
        {open ? (
          <ChevronDown className="size-3" aria-hidden="true" />
        ) : (
          <ChevronRight className="size-3" aria-hidden="true" />
        )}
        {childBeads.length} {childBeads.length === 1 ? 'subtask' : 'subtasks'}
      </Button>

      {open ? (
        <ul className="mt-1 ml-[5px] flex flex-col gap-1 border-l border-border-strong pl-2.5">
          {childBeads.map((child) => {
            const priority = Math.max(0, Math.min(4, child.priority))
            return (
              <li key={child.id}>
                <InteractiveRow
                  variant="plain"
                  size="flush"
                  onClick={() => onOpen(child)}
                  className="flex items-center gap-2 rounded-[6px] px-2 py-1.5 hover:bg-card-hover"
                >
                  <span
                    className={cn(
                      'size-1.5 shrink-0 rounded-full',
                      STATUS_DOT_CLASS[mapStatus(child.status).column],
                    )}
                    aria-hidden="true"
                  />
                  <span className="font-mono text-[10.5px] text-muted-foreground">
                    {child.id}
                  </span>
                  <span
                    className={cn(
                      'rounded-[4px] px-1 py-px font-mono text-[9px] leading-[1.4] font-semibold tabular-nums ring-1 ring-inset ring-current',
                      PRIORITY_TEXT_CLASS[priority],
                    )}
                  >
                    P{priority}
                  </span>
                  <span className="truncate text-[11.5px] text-foreground">
                    {child.title}
                  </span>
                </InteractiveRow>
              </li>
            )
          })}
        </ul>
      ) : null}
    </div>
  )
}

function LinkStat({
  icon: Icon,
  count,
  label,
  className,
}: {
  icon: LucideIcon
  count: number
  label: string
  className?: string
}) {
  return (
    <span
      className={cn('inline-flex items-center gap-0.5 tabular-nums', className)}
      title={label}
    >
      <Icon className="size-3" aria-hidden="true" />
      {count}
      <span className="sr-only">{label}</span>
    </span>
  )
}

export function BeadCard({
  bead,
  onOpen,
  overlay = false,
  nested = false,
}: BeadCardProps) {
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
  const childCount = bead.children?.length ?? childBeads.length
  const { blockedBy, blocking, related } = groupBeadLinks(bead.links)
  const priority = Math.max(0, Math.min(4, bead.priority))

  const style = overlay
    ? undefined
    : { transform: CSS.Transform.toString(transform), transition }

  return (
    <div
      ref={overlay ? undefined : setNodeRef}
      style={style}
      className={cn(
        'group/card relative rounded-[8px] bg-card shadow-card ring-1 ring-inset ring-border transition-[background-color,box-shadow,transform] duration-[120ms] ease-out hover:-translate-y-px hover:bg-card-hover hover:shadow-[0_4px_14px_-4px_oklch(0_0_0/55%)] hover:ring-ring/45',
        epic && 'rounded-l-[4px] border-l-2 border-l-primary-text',
        isDragging && !overlay && 'opacity-40',
        overlay && 'shadow-lg ring-primary/40',
      )}
    >
      {!overlay ? (
        <Button
          variant="ghost"
          size="icon-xs"
          {...attributes}
          {...listeners}
          aria-label="Drag bead"
          className="absolute top-1.5 right-1.5 z-10 size-auto cursor-grab touch-none p-0.5 text-muted-foreground/30 opacity-0 group-hover/card:opacity-100 hover:bg-transparent hover:text-muted-foreground active:cursor-grabbing"
        >
          <GripVertical className="size-3.5" aria-hidden="true" />
        </Button>
      ) : null}

      <InteractiveRow
        variant="plain"
        size="flush"
        onClick={() => onOpen(bead)}
        className="flex cursor-pointer flex-col gap-[7px] rounded-[8px] px-[10px] py-[9px]"
      >
        <span className="flex items-center gap-1.5 pr-5">
          <span className="font-mono text-[11px] tracking-[0.01em] text-muted-foreground">
            {bead.id}
          </span>
          <span
            className={cn(
              'rounded-[4px] px-1 py-px font-mono text-[10px] leading-[1.5] font-semibold tabular-nums ring-1 ring-inset ring-current',
              PRIORITY_TEXT_CLASS[priority],
            )}
          >
            P{priority}
          </span>
          {epic ? (
            <span className="inline-flex items-center gap-1 rounded-[4px] bg-primary/30 px-1.5 py-px text-[10px] font-semibold tracking-[0.06em] text-primary-text uppercase ring-1 ring-inset ring-ring/45">
              <Layers className="size-2.5" aria-hidden="true" />
              Epic
            </span>
          ) : null}
          {badge ? (
            <span
              className={cn(
                'rounded-[4px] px-1.5 py-px text-[10px] font-semibold tracking-[0.06em] uppercase',
                BADGE_TONES[badge.tone],
              )}
            >
              {badge.label}
            </span>
          ) : null}
        </span>

        <span className="line-clamp-2 text-[12.75px] leading-[1.45] text-foreground">
          {bead.title}
        </span>

        {childBeads.length > 0 ? (
          <SubtaskProgress childBeads={childBeads} />
        ) : null}

        <span className="flex items-center gap-1.5">
          {labels.slice(0, 2).map((label) => (
            <span
              key={label}
              className="max-w-[92px] truncate rounded-[4px] px-[5px] text-[10.5px] leading-[1.6] text-muted-foreground ring-1 ring-inset ring-border-strong"
            >
              {label}
            </span>
          ))}

          <span className="ml-auto flex items-center gap-2 font-mono text-[11px] text-muted-foreground tabular-nums">
            {childCount > 0 ? (
              <LinkStat
                icon={ListTree}
                count={childCount}
                label={`${childCount} ${childCount === 1 ? 'subtask' : 'subtasks'}`}
              />
            ) : null}
            {blockedBy.length > 0 ? (
              <LinkStat
                icon={Ban}
                count={blockedBy.length}
                label={`blocked by ${blockedBy.length}`}
                className="text-status-blocked"
              />
            ) : null}
            {blocking.length > 0 ? (
              <LinkStat
                icon={Waypoints}
                count={blocking.length}
                label={`blocking ${blocking.length}`}
              />
            ) : null}
            {related.length > 0 ? (
              <LinkStat
                icon={Link2}
                count={related.length}
                label={`${related.length} related`}
              />
            ) : null}
            {bead.comment_count ? (
              <span className="inline-flex items-center gap-0.5 tabular-nums">
                <MessageSquare className="size-3" aria-hidden="true" />
                {bead.comment_count}
              </span>
            ) : null}
            {bead.assignee ? (
              <Avatar
                size="sm"
                className="size-[19px] bg-white/9 ring-1 ring-inset ring-border-strong"
              >
                <AvatarFallback className="bg-transparent text-[9px] font-semibold tracking-[0.03em] text-foreground">
                  {initials(bead.assignee)}
                </AvatarFallback>
              </Avatar>
            ) : null}
          </span>
        </span>
      </InteractiveRow>

      {nested && childBeads.length > 0 ? (
        <NestedChildren childBeads={childBeads} onOpen={onOpen} />
      ) : null}
    </div>
  )
}
