/**
 * First journal seq an inbox read needs: with a read cursor, one window before
 * it (the unread tail plus the newest kept entries); with none, seq 0.
 */
export function inboxStartSeq(
  cursor: number | undefined,
  window: number,
): number {
  return cursor === undefined ? 0 : Math.max(0, cursor - window)
}

/**
 * Where to resume after bd reports the journal floor and head. Jumps straight
 * to the last `window` records (never below floor-1, which bd requires to read
 * the floor record). Undefined when that would not move forward.
 */
export function truncationResume(
  since: number,
  floor: number,
  head: number,
  window: number,
): number | undefined {
  const resume = Math.max(floor - 1, head - window, 0)
  return resume > since ? resume : undefined
}

/**
 * A missing read cursor is seeded at the journal head only once the newest
 * page has been reached, so a capped backfill never marks old entries as seen.
 */
export function shouldSeedCursor(
  cursor: number | undefined,
  backfilling: boolean,
  disabled: boolean,
): boolean {
  return cursor === undefined && !backfilling && !disabled
}

/**
 * Read position after a page: the last record's seq, or unchanged for an empty
 * page. Advancing on every non-empty page keeps a short final page from being
 * read again on the next poll.
 */
export function advanceSince(
  since: number,
  events: readonly { seq: number }[],
): number {
  return events.length > 0 ? events[events.length - 1].seq : since
}
