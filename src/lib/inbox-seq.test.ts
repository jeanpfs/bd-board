import { describe, expect, it } from 'vitest'

import {
  advanceSince,
  inboxStartSeq,
  shouldSeedCursor,
  truncationResume,
} from './inbox-seq'

describe('inboxStartSeq', () => {
  it('starts one window before the cursor, never below zero', () => {
    expect(inboxStartSeq(500, 200)).toBe(300)
    expect(inboxStartSeq(50, 200)).toBe(0)
  })

  it('starts at zero with no cursor', () => {
    expect(inboxStartSeq(undefined, 200)).toBe(0)
  })
})

describe('truncationResume', () => {
  it('jumps to the last window when the head is far ahead', () => {
    expect(truncationResume(0, 10, 1000, 200)).toBe(800)
  })

  it('never resumes below the floor-1 record', () => {
    expect(truncationResume(0, 900, 1000, 200)).toBe(899)
  })

  it('is undefined when the resume point is not ahead of since', () => {
    expect(truncationResume(800, 10, 1000, 200)).toBeUndefined()
  })
})

describe('shouldSeedCursor', () => {
  it('seeds only a missing cursor once the head is reached', () => {
    expect(shouldSeedCursor(undefined, false, false)).toBe(true)
  })

  it('does not seed while still backfilling', () => {
    expect(shouldSeedCursor(undefined, true, false)).toBe(false)
  })

  it('does not seed an existing cursor or a disabled journal', () => {
    expect(shouldSeedCursor(12, false, false)).toBe(false)
    expect(shouldSeedCursor(undefined, false, true)).toBe(false)
  })
})

describe('advanceSince', () => {
  it('moves to the last seq of a non-empty page', () => {
    expect(advanceSince(0, [{ seq: 3 }, { seq: 5 }])).toBe(5)
  })

  it('keeps the position for an empty page', () => {
    expect(advanceSince(5, [])).toBe(5)
  })
})

/**
 * Mirrors the advance loop in use-inbox.ts over an in-memory journal: one
 * poll reads pages until a short page, returning the new events and position.
 */
function poll(
  journal: { seq: number }[],
  since: number,
  pageSize: number,
): { fresh: { seq: number }[]; since: number } {
  const fresh: { seq: number }[] = []
  for (;;) {
    const events = journal
      .filter((event) => event.seq > since)
      .slice(0, pageSize)
    fresh.push(...events)
    since = advanceSince(since, events)
    if (events.length < pageSize) break
  }
  return { fresh, since }
}

describe('repeated polls over an unchanged journal', () => {
  const journal = Array.from({ length: 7 }, (_, i) => ({ seq: i + 1 }))

  it('adds no duplicates after the final short page', () => {
    const first = poll(journal, 0, 5)
    const second = poll(journal, first.since, 5)
    expect(first.fresh).toHaveLength(7)
    expect(second.fresh).toHaveLength(0)
    expect(second.since).toBe(7)
  })
})
