import { describe, expect, it } from 'vitest'

import { dueState } from './schedule'
import { beadPatchFromUpdate } from './optimistic'

describe('beadPatchFromUpdate', () => {
  it('keeps a due date on the same local calendar day', () => {
    const patch = beadPatchFromUpdate({ due: '2026-11-20' })
    const now = new Date(2026, 10, 20, 12)
    expect(dueState(patch.due_at!, now).label).toBe('Today')
  })

  it('clears due date and assignee with empty strings', () => {
    expect(beadPatchFromUpdate({ due: '', assignee: '' })).toEqual({
      due_at: undefined,
      assignee: undefined,
    })
  })

  it('leaves relative due values for bd to resolve', () => {
    expect(beadPatchFromUpdate({ due: '+2w' })).toEqual({})
  })

  it('maps estimate to estimated_minutes and leaves untouched fields out', () => {
    expect(beadPatchFromUpdate({ estimate: 90, title: 'New' })).toEqual({
      estimated_minutes: 90,
      title: 'New',
    })
  })
})
