import { describe, expect, it } from 'vitest'

import { inboxStartSeq, shouldSeedCursor, truncationResume } from './inbox-seq'

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
