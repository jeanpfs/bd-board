import { describe, expect, it } from 'vitest'

import {
  parseBeadInput,
  parseCommentInput,
  parseCreateBeadInput,
  parseDeferInput,
  parseProjectInput,
  parseStatusUpdateInput,
  parseUpdateBeadInput,
} from './server-validation'

describe('server input validation', () => {
  it('accepts safe project and bead identifiers', () => {
    expect(parseProjectInput({ project: 'bd_board' })).toEqual({
      project: 'bd_board',
    })
    expect(parseBeadInput({ project: 'bd-board', id: 'bd-board-a2k' })).toEqual(
      {
        project: 'bd-board',
        id: 'bd-board-a2k',
      },
    )
  })

  it('rejects path-like project identifiers', () => {
    expect(() => parseProjectInput({ project: '../jjhub' })).toThrow(
      'Project is invalid',
    )
  })

  it('normalizes create bead input', () => {
    expect(
      parseCreateBeadInput({
        project: 'bd-board',
        title: '  Prepare launch  ',
        description: '  Ship docs  ',
        type: 'task',
        parent: 'bd-board-epic',
      }),
    ).toEqual({
      project: 'bd-board',
      title: 'Prepare launch',
      description: 'Ship docs',
      type: 'task',
      parent: 'bd-board-epic',
    })
  })

  it('rejects invalid create fields', () => {
    expect(() =>
      parseCreateBeadInput({ project: 'bd-board', title: '' }),
    ).toThrow('Title is required')
    expect(() =>
      parseCreateBeadInput({
        project: 'bd-board',
        title: 'Task',
        type: 'incident',
      }),
    ).toThrow('Type is invalid')
  })

  it('accepts only board status mutations', () => {
    expect(
      parseStatusUpdateInput({
        project: 'bd-board',
        id: 'bd-board-a2k',
        status: 'in_progress',
      }),
    ).toEqual({
      project: 'bd-board',
      id: 'bd-board-a2k',
      status: 'in_progress',
    })
    expect(() =>
      parseStatusUpdateInput({
        project: 'bd-board',
        id: 'bd-board-a2k',
        status: 'hooked',
      }),
    ).toThrow('Status is invalid')
  })

  it('requires non-empty comments', () => {
    expect(
      parseCommentInput({
        project: 'bd-board',
        id: 'bd-board-a2k',
        text: ' Looks good ',
      }),
    ).toEqual({
      project: 'bd-board',
      id: 'bd-board-a2k',
      text: 'Looks good',
    })
    expect(() =>
      parseCommentInput({ project: 'bd-board', id: 'bd-board-a2k', text: ' ' }),
    ).toThrow('Comment text is required')
  })

  it('normalizes update bead input', () => {
    expect(
      parseUpdateBeadInput({
        project: 'bd-board',
        id: 'bd-board-a2k',
        title: '  Updated title  ',
        description: '  Updated description  ',
        acceptance_criteria: '',
        design: null,
        notes: ' Notes ',
        priority: 0,
        issue_type: 'feature',
        assignee: ' Jean ',
        labels: [' ui ', 'backend', 'ui', ''],
      }),
    ).toEqual({
      project: 'bd-board',
      id: 'bd-board-a2k',
      update: {
        title: 'Updated title',
        description: 'Updated description',
        acceptance_criteria: '',
        design: '',
        notes: 'Notes',
        priority: 0,
        issue_type: 'feature',
        assignee: 'Jean',
        labels: ['backend', 'ui'],
      },
    })
  })

  it('rejects invalid update bead input', () => {
    expect(() =>
      parseUpdateBeadInput({ project: 'bd-board', id: 'bd-board-a2k' }),
    ).toThrow('No bead updates provided')
    expect(() =>
      parseUpdateBeadInput({
        project: 'bd-board',
        id: 'bd-board-a2k',
        title: '',
      }),
    ).toThrow('Title is required')
    expect(() =>
      parseUpdateBeadInput({
        project: 'bd-board',
        id: 'bd-board-a2k',
        priority: 5,
      }),
    ).toThrow('Priority is invalid')
    expect(() =>
      parseUpdateBeadInput({
        project: 'bd-board',
        id: 'bd-board-a2k',
        labels: ['bad label'],
      }),
    ).toThrow('Label is invalid')
  })
})

describe('schedule input validation', () => {
  const base = { project: 'bd-board', id: 'bd-board-a2k' }

  it('accepts a defer date and allows an open-ended defer', () => {
    expect(parseDeferInput({ ...base, until: 'next monday' })).toEqual({
      ...base,
      until: 'next monday',
    })
    expect(parseDeferInput(base)).toEqual(base)
  })

  it('rejects defer dates longer than 40 characters or spanning lines', () => {
    expect(() => parseDeferInput({ ...base, until: 'x'.repeat(41) })).toThrow(
      'until is too long',
    )
    expect(() =>
      parseDeferInput({ ...base, until: 'tomorrow\n--json' }),
    ).toThrow('until is invalid')
  })

  it('passes a due date through, and an empty one clears it', () => {
    expect(parseUpdateBeadInput({ ...base, due: 'tomorrow' }).update).toEqual({
      due: 'tomorrow',
    })
    expect(parseUpdateBeadInput({ ...base, due: '' }).update).toEqual({
      due: '',
    })
    expect(parseUpdateBeadInput({ ...base, due: null }).update).toEqual({
      due: '',
    })
  })

  it('rejects due dates longer than 40 characters or spanning lines', () => {
    expect(() =>
      parseUpdateBeadInput({ ...base, due: 'x'.repeat(41) }),
    ).toThrow('due is too long')
    expect(() => parseUpdateBeadInput({ ...base, due: 'a\nb' })).toThrow(
      'due is invalid',
    )
  })

  it('accepts whole-minute estimates and rejects zero, negatives and fractions', () => {
    expect(parseUpdateBeadInput({ ...base, estimate: 180 }).update).toEqual({
      estimate: 180,
    })
    expect(() => parseUpdateBeadInput({ ...base, estimate: 0 })).toThrow(
      'Estimate is invalid',
    )
    expect(() => parseUpdateBeadInput({ ...base, estimate: -5 })).toThrow(
      'Estimate is invalid',
    )
    expect(() => parseUpdateBeadInput({ ...base, estimate: 1.5 })).toThrow(
      'Estimate is invalid',
    )
  })
})
