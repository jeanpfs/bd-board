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
