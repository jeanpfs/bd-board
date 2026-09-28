import { unsupportedFeedTitle } from '@/lib/bd-version'
import type { BeadFeedStatus } from '@/lib/types'

interface LiveUpdatesIndicatorProps {
  status: BeadFeedStatus
  message?: string
}

export function LiveUpdatesIndicator({
  status,
  message,
}: LiveUpdatesIndicatorProps) {
  if (status === 'live') {
    return (
      <span
        className="inline-flex items-center gap-1.5 text-xs text-muted-foreground"
        title="Live updates from the bd events journal"
      >
        <span className="size-1.5 rounded-full bg-emerald-500" />
        Live
      </span>
    )
  }

  const pollingTitle = {
    connecting: 'Connecting to bd events journal…',
    disabled: 'Enabling the bd events journal for this project…',
    error: `${message} — retrying`,
    unsupported: unsupportedFeedTitle(message),
  }[status]

  return (
    <span
      className="inline-flex items-center gap-1.5 text-xs text-muted-foreground"
      title={pollingTitle}
    >
      <span className="size-1.5 rounded-full bg-muted-foreground/40" />
      Polling
    </span>
  )
}
