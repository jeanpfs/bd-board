/**
 * Background refetch cadence. Every refetch runs bd processes that compete
 * with the user's own actions, and every write invalidates what it touched,
 * so these only catch changes made outside the app.
 */
export const PROJECTS_REFETCH_MS = 30_000

/** With the events journal the live feed pushes changes; without it, poll. */
export function boardRefetchMs(feedLive: boolean): number {
  return feedLive ? 60_000 : 15_000
}

export function knowledgeRefetchMs(feedLive: boolean): number {
  return feedLive ? 60_000 : 30_000
}
