import { describe, expect, it } from 'vitest'

import { inboxStartSeq } from './inbox-seq.ts'

describe('inboxStartSeq', () => {
  it('starts at seq 0 without a read cursor', () => {
    expect(inboxStartSeq(undefined, 200)).toBe(0)
  })

  it('starts one window before the read cursor', () => {
    expect(inboxStartSeq(1000, 200)).toBe(800)
  })

  it('never starts below seq 0', () => {
    expect(inboxStartSeq(50, 200)).toBe(0)
    expect(inboxStartSeq(0, 200)).toBe(0)
  })
})
