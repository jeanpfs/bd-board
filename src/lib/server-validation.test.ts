import { describe, expect, it } from 'vitest'

import {
  assertWritesEnabled,
  parseBeadInput,
  parseCommentInput,
  parseCreateBeadInput,
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

  it('requires an explicit write opt-in', () => {
    expect(() => assertWritesEnabled({})).toThrow('Writes are disabled')
    expect(() =>
      assertWritesEnabled({ BD_BOARD_ALLOW_WRITE: 'true' }),
    ).not.toThrow()
    expect(() =>
      assertWritesEnabled({ BD_BOARD_ALLOW_WRITE: '1' }),
    ).not.toThrow()
  })
})
