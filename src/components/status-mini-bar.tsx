import {
  Tooltip,
  TooltipContent,
  TooltipTrigger,
} from '@/components/ui/tooltip'

import type { ProjectCounts } from '@/lib/types'

interface Segment {
  key: 'open' | 'in_progress' | 'blocked' | 'closed'
  label: string
  value: number
  className: string
}

export function StatusMiniBar({ counts }: { counts: ProjectCounts }) {
  const segments: Segment[] = [
    {
      key: 'open',
      label: 'Aberto',
      value: counts.open + counts.deferred,
      className: 'bg-status-open',
    },
    {
      key: 'in_progress',
      label: 'Em progresso',
      value: counts.in_progress,
      className: 'bg-status-progress',
    },
    {
      key: 'blocked',
      label: 'Bloqueado',
      value: counts.blocked,
      className: 'bg-status-blocked',
    },
    {
      key: 'closed',
      label: 'Fechado',
      value: counts.closed,
      className: 'bg-status-closed',
    },
  ]

  const total = segments.reduce((sum, s) => sum + s.value, 0)

  if (total === 0) {
    return (
      <div
        className="h-2 w-full overflow-hidden rounded-full bg-muted"
        aria-hidden="true"
      />
    )
  }

  return (
    <div className="flex h-2 w-full overflow-hidden rounded-full bg-muted ring-1 ring-inset ring-foreground/5">
      {segments
        .filter((segment) => segment.value > 0)
        .map((segment) => {
          const pct = (segment.value / total) * 100
          return (
            <Tooltip key={segment.key}>
              <TooltipTrigger asChild>
                <div
                  className={`${segment.className} h-full transition-[width] duration-500 ease-out`}
                  style={{ width: `${pct}%` }}
                />
              </TooltipTrigger>
              <TooltipContent>
                {segment.label} · {segment.value}
              </TooltipContent>
            </Tooltip>
          )
        })}
    </div>
  )
}
