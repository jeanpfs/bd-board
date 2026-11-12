import { describe, expect, it } from 'vitest'

import {
  parseCustomStatuses,
  serializeCustomStatuses,
  validateStatusName,
} from './custom-statuses.ts'

describe('parseCustomStatuses', () => {
  it('parses name:category pairs in order', () => {
    expect(parseCustomStatuses('in_review:wip,archived:done')).toEqual([
      { name: 'in_review', category: 'wip' },
      { name: 'archived', category: 'done' },
    ])
  })

  it('returns an empty list for an empty value', () => {
    expect(parseCustomStatuses('')).toEqual([])
    expect(parseCustomStatuses('  ')).toEqual([])
  })

  it('ignores blank segments and trims whitespace', () => {
    expect(parseCustomStatuses(' qa:wip , ,')).toEqual([
      { name: 'qa', category: 'wip' },
    ])
  })
})

describe('serializeCustomStatuses', () => {
  it('writes every row as name:category joined by commas', () => {
    expect(
      serializeCustomStatuses([
        { name: 'in_review', category: 'wip' },
        { name: 'qa', category: 'frozen' },
      ]),
    ).toBe('in_review:wip,qa:frozen')
  })

  it('round-trips through parseCustomStatuses', () => {
    const rows = [
      { name: 'in_review', category: 'wip' as const },
      { name: 'archived', category: 'done' as const },
    ]
    expect(parseCustomStatuses(serializeCustomStatuses(rows))).toEqual(rows)
  })

  it('serializes an empty list to an empty string', () => {
    expect(serializeCustomStatuses([])).toBe('')
  })
})

describe('validateStatusName', () => {
  it('accepts a lowercase letter-first name', () => {
    expect(validateStatusName('in_review2', [])).toBeNull()
  })

  it('rejects empty, uppercase, hyphenated and digit-first names', () => {
    expect(validateStatusName('', [])).not.toBeNull()
    expect(validateStatusName('InReview', [])).not.toBeNull()
    expect(validateStatusName('in-review', [])).not.toBeNull()
    expect(validateStatusName('2fa', [])).not.toBeNull()
  })

  it('rejects built-in status names', () => {
    expect(validateStatusName('blocked', [])).toMatch(/built-in/)
    expect(validateStatusName('closed', [])).toMatch(/built-in/)
  })

  it('rejects a name already in use by another custom status', () => {
    expect(validateStatusName('qa', ['qa', 'review'])).toMatch(/already/)
  })
})
