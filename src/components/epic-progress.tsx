import { mapStatus } from '@/lib/types'

import type { Bead, BeadColumn } from '@/lib/types'

interface EpicProgressProps {
  childBeads: Bead[]
  showDots?: boolean
  className?: string
}

const SEGMENT_ORDER: { key: BeadColumn; className: string }[] = [
  { key: 'closed', className: 'bg-status-closed' },
  { key: 'in_progress', className: 'bg-status-progress' },
  { key: 'blocked', className: 'bg-status-blocked' },
  { key: 'open', className: 'bg-status-open' },
]

function columnOf(bead: Bead): BeadColumn {
  return mapStatus(bead.status).column
}

export function EpicProgress({
  childBeads,
  showDots = true,
  className,
}: EpicProgressProps) {
  const total = childBeads.length

  if (total === 0) {
    return (
      <span className="block text-[0.7rem] text-muted-foreground/70">
        sem sub-tarefas
      </span>
    )
  }

  const counts: Record<BeadColumn, number> = {
    open: 0,
    in_progress: 0,
    blocked: 0,
    closed: 0,
  }
  for (const child of childBeads) {
    counts[columnOf(child)] += 1
  }

  const done = counts.closed

  return (
    <span
      className={
        className
          ? `flex flex-col gap-1.5 ${className}`
          : 'flex flex-col gap-1.5'
      }
    >
      <span className="flex h-1.5 w-full overflow-hidden rounded-full bg-muted ring-1 ring-inset ring-foreground/5">
        {SEGMENT_ORDER.filter((s) => counts[s.key] > 0).map((s) => (
          <span
            key={s.key}
            className={`${s.className} h-full transition-[width] duration-500 ease-out`}
            style={{ width: `${(counts[s.key] / total) * 100}%` }}
          />
        ))}
      </span>

      <span className="flex items-center justify-between gap-2">
        <span className="text-[0.7rem] font-medium text-muted-foreground tabular-nums">
          {done}/{total} concluídas
        </span>
        {showDots && total <= 28 ? (
          <span className="flex flex-wrap items-center justify-end gap-1">
            {childBeads.map((child) => {
              const seg = SEGMENT_ORDER.find((s) => s.key === columnOf(child))
              return (
                <span
                  key={child.id}
                  className={`size-1.5 shrink-0 rounded-full ${seg?.className ?? 'bg-status-open'}`}
                  aria-hidden="true"
                />
              )
            })}
          </span>
        ) : null}
      </span>
    </span>
  )
}
