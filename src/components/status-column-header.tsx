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
        'flex min-w-0 items-center gap-2 rounded-[8px] bg-canvas px-2.5 py-[7px] ring-1 ring-inset ring-border',
        className,
      )}
    >
      <span
        className={cn('size-[7px] shrink-0 rounded-full', DOT_CLASS[column])}
        aria-hidden="true"
      />
      <h2 className="truncate text-[12.5px] font-semibold tracking-[-0.005em] text-foreground">
        {label}
      </h2>
      <span
        className={cn(
          'ml-auto font-mono text-[11.5px] font-medium tabular-nums',
          COUNT_CLASS[column],
        )}
      >
        {count}
      </span>
    </div>
  )
}
