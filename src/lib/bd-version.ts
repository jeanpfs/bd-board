export const MIN_BD_VERSION_LIVE_UPDATES = '1.3.0'

export type BdVersion = [number, number, number]

/** Extracts major.minor.patch from strings like `bd version 1.3.0 (Homebrew)` or `v1.3.0-rc1`. */
export function parseBdVersion(raw: string): BdVersion | null {
  const match = /(\d+)\.(\d+)\.(\d+)/.exec(raw)
  if (!match) return null
  return [Number(match[1]), Number(match[2]), Number(match[3])]
}

function compare(a: BdVersion, b: BdVersion): number {
  for (let i = 0; i < 3; i++) {
    if (a[i] !== b[i]) return a[i] - b[i]
  }
  return 0
}

/** True only when both versions parse and `raw` >= `min`. Unknown is never "at least". */
export function isBdAtLeast(raw: string, min: string): boolean {
  const a = parseBdVersion(raw)
  const b = parseBdVersion(min)
  return a !== null && b !== null && compare(a, b) >= 0
}

/** True only when both versions parse and `raw` < `min`. Unknown is never "older". */
export function isBdOlderThan(raw: string, min: string): boolean {
  const a = parseBdVersion(raw)
  const b = parseBdVersion(min)
  return a !== null && b !== null && compare(a, b) < 0
}

/** Detects a bd build that lacks the `bd events` command. */
export function isBdEventsUnsupported(message: string | undefined): boolean {
  return /unknown (sub)?command|no such command|unrecognized command/i.test(
    message ?? '',
  )
}

export function unsupportedFeedTitle(message: string | undefined): string {
  if (isBdEventsUnsupported(message)) {
    return `Live updates need bd >= ${MIN_BD_VERSION_LIVE_UPDATES} (see README)`
  }
  return `Live updates unavailable: ${message ?? ''}`
}
