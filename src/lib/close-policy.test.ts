import { describe, expect, it } from 'vitest'

import { closeRefusalReason } from './close-policy'

describe('closeRefusalReason', () => {
  it('keeps the reason from bd 1.3 open-children refusals', () => {
    expect(
      closeRefusalReason(
        'bd exited with status 1: Error updating ldg-axk: cannot close ldg-axk: 3 open child issue(s); close children first or use --force to override Error: 1 of 1 issues failed to update ldg-axk: updating issue: cannot close ldg-axk: 3 open child issue(s); close children first or use --force to override',
      ),
    ).toBe('Cannot close ldg-axk: 3 open child issue(s)')
  })

  it('keeps the blocker list from blocked-issue refusals', () => {
    expect(
      closeRefusalReason(
        'Error updating lab-mqq: cannot close blocked issue: lab-mqq is blocked by [lab-3t7]\nError: 1 of 1 issues failed to update',
      ),
    ).toBe('Cannot close blocked issue: lab-mqq is blocked by [lab-3t7]')
  })

  it('ignores unrelated failures', () => {
    expect(closeRefusalReason('Error: issue lab-1 not found')).toBeNull()
  })
})
