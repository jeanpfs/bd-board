import { describe, expect, it } from 'vitest'

import { cn } from './utils'

describe('cn', () => {
  it('keeps a design-system text size next to a text color', () => {
    expect(cn('font-mono text-badge', 'text-warn')).toBe(
      'font-mono text-badge text-warn',
    )
    expect(cn('text-body text-muted-foreground')).toBe(
      'text-body text-muted-foreground',
    )
  })

  it('still lets a later text size win over an earlier one', () => {
    expect(cn('text-xs', 'text-badge')).toBe('text-badge')
    expect(cn('text-title', 'text-sm')).toBe('text-sm')
  })

  it('treats the spacing roles as spacing', () => {
    expect(cn('min-h-10', 'min-h-row')).toBe('min-h-row')
  })
})
