import { describe, expect, it } from 'vitest'

import { buildUpdateBeadArgs } from './bd'

describe('buildUpdateBeadArgs', () => {
  it('builds bd update arguments for editable fields', () => {
    expect(
      buildUpdateBeadArgs('bd-board-a2k', {
        title: 'Updated title',
        description: 'Updated description',
        acceptance_criteria: 'Updated acceptance',
        design: 'Updated design',
        notes: 'Updated notes',
        priority: 0,
        issue_type: 'feature',
        assignee: 'Jean',
        labels: ['backend', 'ui'],
      }),
    ).toEqual([
      'update',
      'bd-board-a2k',
      '--title',
      'Updated title',
      '--description',
      'Updated description',
      '--acceptance',
      'Updated acceptance',
      '--design',
      'Updated design',
      '--notes',
      'Updated notes',
      '--priority',
      '0',
      '--type',
      'feature',
      '--assignee',
      'Jean',
      '--set-labels',
      'backend,ui',
    ])
  })

  it('removes existing labels when labels are explicitly empty', () => {
    expect(buildUpdateBeadArgs('bd-board-a2k', { labels: [] }, ['old', 'ui']))
      .toEqual([
        'update',
        'bd-board-a2k',
        '--remove-label',
        'old',
        '--remove-label',
        'ui',
      ])
  })
})
