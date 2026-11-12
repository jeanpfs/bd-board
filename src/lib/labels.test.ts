import { describe, expect, it } from 'vitest'

import { labelCounts, labelToCommit, suggestLabels } from '@/lib/labels'

import type { Bead } from '@/lib/types'

function bead(id: string, labels?: string[]): Bead {
  return { id, title: id, labels } as Bead
}

describe('labelCounts', () => {
  it('counts beads per label, most used first, ties by name', () => {
    const beads = [
      bead('a', ['ui', 'backend']),
      bead('b', ['backend']),
      bead('c', ['zeta', 'ui']),
      bead('d'),
      bead('e', []),
    ]
    expect(labelCounts(beads)).toEqual([
      { label: 'backend', count: 2 },
      { label: 'ui', count: 2 },
      { label: 'zeta', count: 1 },
    ])
  })

  it('counts a label once per bead even when repeated', () => {
    expect(labelCounts([bead('a', ['ui', 'ui'])])).toEqual([
      { label: 'ui', count: 1 },
    ])
  })
})

describe('suggestLabels', () => {
  const counts = [
    { label: 'frontend', count: 4 },
    { label: 'pdf', count: 3 },
    { label: 'forms', count: 1 },
    { label: 'bug', count: 1 },
    { label: 'unform', count: 1 },
  ]

  it('lists prefix matches before substring matches, case-insensitively', () => {
    expect(suggestLabels('FO', counts, []).matches.map((m) => m.label)).toEqual(
      ['forms', 'unform'],
    )
  })

  it('keeps count order within each tier', () => {
    expect(suggestLabels('f', counts, []).matches.map((m) => m.label)).toEqual([
      'frontend',
      'forms',
      'pdf',
      'unform',
    ])
  })

  it('excludes already selected labels', () => {
    const result = suggestLabels('fo', counts, ['forms'])
    expect(result.matches.map((m) => m.label)).toEqual(['unform'])
  })

  it('offers create only when there is no exact match', () => {
    expect(suggestLabels('fo', counts, []).create).toBe('fo')
    expect(suggestLabels('forms', counts, []).create).toBeUndefined()
    expect(suggestLabels('FORMS', counts, []).create).toBeUndefined()
  })

  it('does not offer create for a label that is already selected', () => {
    expect(suggestLabels('newone', counts, ['newone']).create).toBeUndefined()
  })

  it('trims the input before matching and creating', () => {
    expect(suggestLabels('  fo  ', counts, []).create).toBe('fo')
  })

  it('rejects commas, blank and overlong input for create', () => {
    expect(suggestLabels('a,b', counts, []).create).toBeUndefined()
    expect(suggestLabels('   ', counts, []).create).toBeUndefined()
    expect(suggestLabels('x'.repeat(51), counts, []).create).toBeUndefined()
    expect(suggestLabels('x'.repeat(50), counts, []).create).toBe(
      'x'.repeat(50),
    )
  })

  it('does not offer create for labels the server rejects', () => {
    expect(suggestLabels('two words', counts, []).create).toBeUndefined()
    expect(suggestLabels('a,b', counts, []).create).toBeUndefined()
    expect(suggestLabels('-lead', counts, []).create).toBeUndefined()
  })

  it('offers create for a colon-namespaced label bd accepts', () => {
    expect(suggestLabels('provides:x', counts, []).create).toBe('provides:x')
  })

  it('lists every unselected label for empty input, most used first', () => {
    const result = suggestLabels('', counts, ['pdf'])
    expect(result.create).toBeUndefined()
    expect(result.matches.map((m) => m.label)).toEqual([
      'frontend',
      'bug',
      'forms',
      'unform',
    ])
  })
})

describe('labelToCommit', () => {
  const counts = [
    { label: 'frontend', count: 4 },
    { label: 'forms', count: 1 },
  ]

  it('commits a valid new label typed but not picked', () => {
    expect(labelToCommit('newone', counts, [])).toBe('newone')
  })

  it('commits the existing label matching the typed text, any case', () => {
    expect(labelToCommit('FORMS', counts, [])).toBe('forms')
  })

  it('commits nothing for blank, rejected or already selected text', () => {
    expect(labelToCommit('   ', counts, [])).toBeUndefined()
    expect(labelToCommit('two words', counts, [])).toBeUndefined()
    expect(labelToCommit('forms', counts, ['forms'])).toBeUndefined()
  })
})
