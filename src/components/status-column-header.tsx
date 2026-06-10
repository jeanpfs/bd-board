import { cn } from '@/lib/utils'

import type { BeadColumn } from '@/lib/types'

interface StatusColumnHeaderProps {
  column: BeadColumn
  label: string
  count: number
  className?: string
}

const DOT_CLASS: Record<BeadColumn, string> = {
  open: 'bg-status-open',
  in_progress: 'bg-status-progress',
  blocked: 'bg-status-blocked',
  closed: 'bg-status-closed',
}

const SURFACE_CLASS: Record<BeadColumn, string> = {
  open: 'border-status-open/20 bg-status-open/10',
  in_progress: 'border-status-progress/25 bg-status-progress/10',
  blocked: 'border-status-blocked/25 bg-status-blocked/10',
  closed: 'border-status-closed/25 bg-status-closed/10',
}

const COUNT_CLASS: Record<BeadColumn, string> = {
  open: 'text-status-open',
  in_progress: 'text-status-progress',
  blocked: 'text-status-blocked',
  closed: 'text-status-closed',
}

export function StatusColumnHeader({
  column,
  label,
  count,
  className,
}: StatusColumnHeaderProps) {
  return (
    <div
      className={cn(
        'flex min-h-10 min-w-0 items-center gap-2 rounded-lg border px-3 py-2 shadow-sm shadow-black/5',
        SURFACE_CLASS[column],
        className,
      )}
    >
      <span
        className={cn('size-2 shrink-0 rounded-full', DOT_CLASS[column])}
        aria-hidden="true"
      />
      <h2 className="truncate text-sm font-semibold tracking-tight text-foreground">
        {label}
      </h2>
      <span
        className={cn(
          'ml-auto rounded-md bg-background/75 px-1.5 py-0.5 text-xs font-medium tabular-nums ring-1 ring-inset ring-foreground/10',
          COUNT_CLASS[column],
        )}
      >
        {count}
      </span>
    </div>
  )
}
