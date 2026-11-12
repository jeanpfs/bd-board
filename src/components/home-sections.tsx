import {
  AlertTriangle,
  Ban,
  Clock,
  ClockAlert,
  DatabaseZap,
  Hand,
  FolderX,
  Unplug,
} from 'lucide-react'

import { cn } from '@/lib/utils'

import type { LucideIcon } from 'lucide-react'
import type { AttentionKind, ProjectProblem } from '@/lib/attention'

type SignalKind = AttentionKind | ProjectProblem['kind']

/** Icon and color per signal: color is never the only cue. */
export const SIGNAL_ICON: Record<
  SignalKind,
  { icon: LucideIcon; className: string; label: string }
> = {
  p0: { icon: AlertTriangle, className: 'text-status-blocked', label: 'P0' },
  overdue: {
    icon: ClockAlert,
    className: 'text-status-blocked',
    label: 'Overdue',
  },
  blocked: { icon: Ban, className: 'text-status-blocked', label: 'Blocked' },
  stale: { icon: Clock, className: 'text-warn', label: 'Stale' },
  missing: {
    icon: FolderX,
    className: 'text-status-blocked',
    label: 'Missing',
  },
  error: {
    icon: AlertTriangle,
    className: 'text-status-blocked',
    label: 'Error',
  },
  migration: { icon: DatabaseZap, className: 'text-warn', label: 'Read-only' },
  'lease-expired': {
    icon: Unplug,
    className: 'text-status-blocked',
    label: 'Lease expired',
  },
  gate: { icon: Hand, className: 'text-warn', label: 'Waiting on you' },
}

/** Unboxed section: a quiet heading with optional meta, then content. */
export function Section({
  title,
  meta,
  children,
  className,
}: {
  title: string
  meta?: React.ReactNode
  children: React.ReactNode
  className?: string
}) {
  return (
    <section className={cn('flex min-w-0 flex-col gap-2', className)}>
      <h2 className="flex items-baseline gap-2 text-body font-semibold text-foreground">
        {title}
        {meta !== undefined ? (
          <span className="text-xs font-normal text-faint">{meta}</span>
        ) : null}
      </h2>
      {children}
    </section>
  )
}

/** The one outlined block on a home screen: what needs someone now. */
export function AttentionBlock({
  title,
  meta,
  empty,
  children,
}: {
  title: string
  meta?: React.ReactNode
  /** Shown instead of the block when there is nothing to list. */
  empty: string
  children: React.ReactNode[]
}) {
  if (children.length === 0) {
    return <p className="text-body text-muted-foreground">{empty}</p>
  }
  return (
    <section className="rounded-xl ring-1 ring-inset ring-border">
      <h2 className="flex items-baseline gap-2 px-5 pt-4 pb-2 text-body font-semibold text-foreground">
        {title}
        {meta !== undefined ? (
          <span className="text-xs font-normal text-faint">{meta}</span>
        ) : null}
      </h2>
      <ul className="flex flex-col px-2 pb-2">{children}</ul>
    </section>
  )
}

export function AttentionRow({
  kind,
  id,
  title,
  meta,
  action,
}: {
  kind: SignalKind
  id?: string
  title: string
  meta: React.ReactNode
  action: React.ReactNode
}) {
  const signal = SIGNAL_ICON[kind]
  const Icon = signal.icon
  return (
    <li className="flex min-h-row items-center gap-3 border-t border-border/60 px-3 py-2.5 first:border-t-0">
      <Icon
        className={cn('size-4 shrink-0', signal.className)}
        aria-label={signal.label}
      />
      <div className="flex min-w-0 flex-1 flex-col gap-0.5">
        <p className="flex min-w-0 items-baseline gap-2 text-body text-foreground">
          {id ? (
            <span className="shrink-0 font-mono text-xs text-muted-foreground">
              {id}
            </span>
          ) : null}
          <span className="truncate">{title}</span>
        </p>
        <p className="truncate text-xs text-muted-foreground">{meta}</p>
      </div>
      {action}
    </li>
  )
}

/** Row of an unboxed list: hairline separators, no card. */
export const LIST_ROW =
  'flex min-h-row w-full min-w-0 items-center gap-2.5 rounded-md px-3 text-left text-body outline-none hover:bg-foreground/4 focus-visible:ring-2 focus-visible:ring-ring/60'
