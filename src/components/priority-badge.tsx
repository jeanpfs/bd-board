import { PRIORITY_TEXT_CLASS, clampPriority } from '@/lib/sort'
import { cn } from '@/lib/utils'

/** `P0`…`P4` in its priority color, outlined. */
export function PriorityBadge({
  priority,
  className,
}: {
  priority: number
  className?: string
}) {
  const p = clampPriority(priority)
  return (
    <span
      className={cn(
        'shrink-0 rounded-[4px] px-1 py-px font-mono text-badge leading-[1.5] font-semibold tabular-nums ring-1 ring-inset ring-current',
        PRIORITY_TEXT_CLASS[p],
        className,
      )}
    >
      P{p}
    </span>
  )
}
