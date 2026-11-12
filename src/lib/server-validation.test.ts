import { describe, expect, it } from 'vitest'

import {
  parseBeadInput,
  parseQueryInput,
  parseViewsKeyInput,
  parseViewsWriteInput,
  parseClaimInput,
  parseCommentInput,
  parseConfigKeyInput,
  parseGetConfigInput,
  parseSetConfigInput,
  parseLinearSyncInput,
  parseCreateBeadInput,
  parseDeferInput,
  parseProjectInput,
  parseRelationInput,
  parseRemoveRelationInput,
  parseStatusUpdateInput,
  parseTailEventsInput,
  parseUnclaimInput,
  parseUpdateBeadInput,
  parseUpdateManyInput,
  parseCloseManyInput,
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

  it('accepts labels on create and rejects malformed ones', () => {
    expect(
      parseCreateBeadInput({
        project: 'bd-board',
        title: 'Task',
        labels: ['ui', 'pdf'],
      }).labels,
    ).toEqual(['pdf', 'ui'])
    expect(() =>
      parseCreateBeadInput({
        project: 'bd-board',
        title: 'Task',
        labels: 'ui',
      }),
    ).toThrow('labels must be a list')
    expect(() =>
      parseCreateBeadInput({
        project: 'bd-board',
        title: 'Task',
        labels: ['a,b'],
      }),
    ).toThrow('Label is invalid')
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

describe('relation input validation', () => {
  const base = {
    project: 'bd-board',
    id: 'bd-board-a2k',
    target: 'bd-board-b3m',
  }

  it('accepts every relation kind', () => {
    for (const kind of [
      'blocked-by',
      'blocks',
      'relates-to',
      'duplicate-of',
      'supersedes',
    ]) {
      expect(parseRelationInput({ ...base, kind }).kind).toBe(kind)
    }
  })

  it('rejects kinds that are not relation kinds', () => {
    expect(() => parseRelationInput({ ...base, kind: 'related' })).toThrow(
      'Unknown relation kind',
    )
    expect(() => parseRelationInput({ ...base, kind: 'parent-child' })).toThrow(
      'Unknown relation kind',
    )
  })

  it('rejects a bead related to itself', () => {
    expect(() =>
      parseRelationInput({ ...base, target: base.id, kind: 'blocks' }),
    ).toThrow('A bead cannot relate to itself')
  })

  it('rejects malformed target ids', () => {
    expect(() =>
      parseRelationInput({ ...base, target: '../etc', kind: 'blocks' }),
    ).toThrow('Target bead id is invalid')
  })

  it('accepts only the removable kinds on removal', () => {
    for (const kind of ['blocked-by', 'blocks', 'relates-to']) {
      expect(parseRemoveRelationInput({ ...base, kind }).kind).toBe(kind)
    }
    expect(() =>
      parseRemoveRelationInput({ ...base, kind: 'duplicate-of' }),
    ).toThrow('Unknown relation kind')
    expect(() =>
      parseRemoveRelationInput({ ...base, target: base.id, kind: 'blocks' }),
    ).toThrow('A bead cannot relate to itself')
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

describe('claim input', () => {
  it('accepts an id with an optional actor', () => {
    expect(parseClaimInput({ project: 'p', id: 'bd-1' })).toEqual({
      project: 'p',
      id: 'bd-1',
      actor: undefined,
    })
    expect(
      parseClaimInput({ project: 'p', id: 'bd-1', actor: ' maya ' }).actor,
    ).toBe('maya')
  })

  it('rejects bad ids and flag-like actors', () => {
    expect(() => parseClaimInput({ project: 'p', id: '--force' })).toThrow()
    expect(() =>
      parseClaimInput({ project: 'p', id: 'bd-1', actor: '--force' }),
    ).toThrow()
  })
})

describe('unclaim input', () => {
  it('defaults force to false and keeps a trimmed actor', () => {
    expect(
      parseUnclaimInput({ project: 'p', id: 'bd-1', actor: ' maya ' }),
    ).toEqual({ project: 'p', id: 'bd-1', force: false, actor: 'maya' })
  })

  it('accepts force when given as a boolean', () => {
    expect(
      parseUnclaimInput({ project: 'p', id: 'bd-1', force: true }).force,
    ).toBe(true)
  })

  it('rejects a non-boolean force and a flag-like actor', () => {
    expect(() =>
      parseUnclaimInput({ project: 'p', id: 'bd-1', force: 'yes' }),
    ).toThrow('force must be true or false')
    expect(() =>
      parseUnclaimInput({ project: 'p', id: 'bd-1', actor: '--force' }),
    ).toThrow('actor is invalid')
  })
})

describe('config key input', () => {
  it('accepts only the allowlisted keys', () => {
    expect(parseConfigKeyInput({ project: 'p', key: 'claim.pools' })).toEqual({
      project: 'p',
      key: 'claim.pools',
    })
    expect(
      parseConfigKeyInput({ project: 'p', key: 'events-journal' }).key,
    ).toBe('events-journal')
    expect(
      parseConfigKeyInput({ project: 'p', key: 'status.custom' }).key,
    ).toBe('status.custom')
    expect(() => parseConfigKeyInput({ project: 'p', key: '../etc' })).toThrow(
      'Config key is not allowed',
    )
  })
})

describe('set config input', () => {
  it('accepts a boolean events-journal value', () => {
    expect(
      parseSetConfigInput({
        project: 'p',
        key: 'events-journal',
        value: 'true',
      }),
    ).toEqual({ project: 'p', key: 'events-journal', value: 'true' })
    expect(() =>
      parseSetConfigInput({
        project: 'p',
        key: 'events-journal',
        value: 'yes',
      }),
    ).toThrow()
  })

  it('validates status.custom through the custom-status parser', () => {
    expect(
      parseSetConfigInput({
        project: 'p',
        key: 'status.custom',
        value: 'qa:wip,archived:done',
      }).value,
    ).toBe('qa:wip,archived:done')
    expect(() =>
      parseSetConfigInput({
        project: 'p',
        key: 'status.custom',
        value: 'Bad:wip',
      }),
    ).toThrow()
    expect(() =>
      parseSetConfigInput({
        project: 'p',
        key: 'status.custom',
        value: 'open:wip',
      }),
    ).toThrow()
  })

  it('accepts an empty pool list and rejects newlines or bad pool names', () => {
    expect(
      parseSetConfigInput({ project: 'p', key: 'claim.pools', value: '' })
        .value,
    ).toBe('')
    expect(() =>
      parseSetConfigInput({ project: 'p', key: 'claim.pools', value: 'a\nb' }),
    ).toThrow()
    expect(() =>
      parseSetConfigInput({ project: 'p', key: 'claim.pools', value: '--x' }),
    ).toThrow()
  })

  it('rejects keys outside the allowlist', () => {
    expect(() =>
      parseSetConfigInput({ project: 'p', key: 'daemon.port', value: '1' }),
    ).toThrow('Config key is not allowed')
  })
})

describe('linear config input', () => {
  it('accepts an api key without whitespace and clearing with empty', () => {
    expect(
      parseSetConfigInput({
        project: 'p',
        key: 'linear.api_key',
        value: 'lin_api_abc123',
      }).value,
    ).toBe('lin_api_abc123')
    expect(
      parseSetConfigInput({ project: 'p', key: 'linear.api_key', value: '' })
        .value,
    ).toBe('')
  })

  it('rejects api keys with whitespace, newlines or a leading dash', () => {
    for (const value of ['lin api', 'lin_api_abc\n', 'a\tb', ' lin', '-lin']) {
      expect(() =>
        parseSetConfigInput({ project: 'p', key: 'linear.api_key', value }),
      ).toThrow()
    }
  })

  it('accepts conservative team and project ids and rejects unsafe ones', () => {
    expect(
      parseSetConfigInput({ project: 'p', key: 'linear.team_id', value: 'BIL' })
        .value,
    ).toBe('BIL')
    expect(
      parseSetConfigInput({
        project: 'p',
        key: 'linear.project_id',
        value: 'f1e2-d3c4.b5_a6',
      }).value,
    ).toBe('f1e2-d3c4.b5_a6')
    for (const value of ['a b', '-BIL', 'a/b', 'a\nb', '.hidden']) {
      expect(() =>
        parseSetConfigInput({ project: 'p', key: 'linear.team_id', value }),
      ).toThrow()
    }
  })

  it('refuses to read the api key back', () => {
    expect(() =>
      parseGetConfigInput({ project: 'p', key: 'linear.api_key' }),
    ).toThrow('linear.api_key is write-only')
    expect(
      parseGetConfigInput({ project: 'p', key: 'linear.team_id' }).key,
    ).toBe('linear.team_id')
  })
})

describe('linear sync input', () => {
  it('accepts each direction with boolean flags', () => {
    expect(
      parseLinearSyncInput({
        project: 'p',
        direction: 'pull',
        relations: true,
        dryRun: false,
      }),
    ).toEqual({
      project: 'p',
      direction: 'pull',
      relations: true,
      dryRun: false,
    })
    expect(
      parseLinearSyncInput({
        project: 'p',
        direction: 'both',
        relations: false,
        dryRun: true,
      }).direction,
    ).toBe('both')
  })

  it('rejects unknown directions and non-boolean flags', () => {
    expect(() =>
      parseLinearSyncInput({
        project: 'p',
        direction: 'sideways',
        relations: false,
        dryRun: false,
      }),
    ).toThrow()
    expect(() =>
      parseLinearSyncInput({
        project: 'p',
        direction: 'pull',
        relations: 'yes',
        dryRun: false,
      }),
    ).toThrow()
  })
})

describe('events tail input', () => {
  it('accepts a project, a non-negative cursor and a page limit', () => {
    expect(
      parseTailEventsInput({ project: 'bd_board', since: 0, limit: 200 }),
    ).toEqual({ project: 'bd_board', since: 0, limit: 200 })
  })

  it('rejects a negative or fractional cursor', () => {
    expect(() =>
      parseTailEventsInput({ project: 'bd_board', since: -1, limit: 200 }),
    ).toThrow()
    expect(() =>
      parseTailEventsInput({ project: 'bd_board', since: 1.5, limit: 200 }),
    ).toThrow()
  })

  it('rejects a page limit outside 1 to 1000', () => {
    expect(() =>
      parseTailEventsInput({ project: 'bd_board', since: 0, limit: 0 }),
    ).toThrow()
    expect(() =>
      parseTailEventsInput({ project: 'bd_board', since: 0, limit: 1001 }),
    ).toThrow()
  })
})

describe('query and shared views input', () => {
  it('accepts a query and trims it', () => {
    expect(
      parseQueryInput({ project: 'ledger', query: '  type=bug  ' }),
    ).toEqual({ project: 'ledger', query: 'type=bug' })
  })

  it('rejects queries bd cannot receive safely', () => {
    expect(() => parseQueryInput({ project: 'ledger', query: '' })).toThrow()
    expect(() =>
      parseQueryInput({ project: 'ledger', query: '-all' }),
    ).toThrow()
    expect(() =>
      parseQueryInput({ project: 'ledger', query: 'a\nb' }),
    ).toThrow()
    expect(() =>
      parseQueryInput({ project: 'ledger', query: 'a'.repeat(501) }),
    ).toThrow()
  })

  it('allows only the shared views kv key', () => {
    expect(
      parseViewsKeyInput({ project: 'ledger', key: 'bd-board.views' }),
    ).toEqual({ project: 'ledger', key: 'bd-board.views' })
    expect(() =>
      parseViewsKeyInput({ project: 'ledger', key: 'anything.else' }),
    ).toThrow()
  })

  it('accepts a well-formed shared views list on write', () => {
    const value = JSON.stringify([
      { id: 'open-bugs', name: 'Open bugs', query: 'type=bug', shared: true },
    ])
    expect(
      parseViewsWriteInput({ project: 'ledger', key: 'bd-board.views', value }),
    ).toEqual({ project: 'ledger', key: 'bd-board.views', value })
  })

  it('rejects a shared views list with invalid entries or non-array JSON', () => {
    const bad = JSON.stringify([{ id: 'bad id', name: 'x', query: 'y' }])
    expect(() =>
      parseViewsWriteInput({
        project: 'ledger',
        key: 'bd-board.views',
        value: bad,
      }),
    ).toThrow()
    expect(() =>
      parseViewsWriteInput({
        project: 'ledger',
        key: 'bd-board.views',
        value: '{"a":1}',
      }),
    ).toThrow()
    expect(() =>
      parseViewsWriteInput({
        project: 'ledger',
        key: 'bd-board.views',
        value: 'nope',
      }),
    ).toThrow()
  })
})

describe('bulk input validation', () => {
  const ids = ['bd-a1', 'bd-a2.1']

  it('accepts ids with a patch and trims the values', () => {
    expect(
      parseUpdateManyInput({
        project: 'bd-board',
        ids,
        patch: {
          status: 'in_progress',
          priority: 0,
          assignee: ' maya ',
          addLabels: ['ui', 'ui', 'pdf'],
          due: 'tomorrow',
        },
      }),
    ).toEqual({
      project: 'bd-board',
      ids,
      patch: {
        status: 'in_progress',
        priority: 0,
        assignee: 'maya',
        addLabels: ['pdf', 'ui'],
        due: 'tomorrow',
      },
    })
  })

  it('lets an empty assignee or due clear the field', () => {
    expect(
      parseUpdateManyInput({
        project: 'bd-board',
        ids,
        patch: { assignee: '', due: '' },
      }).patch,
    ).toEqual({ assignee: '', due: '' })
  })

  it('rejects an empty patch, closed status and bad values', () => {
    const base = { project: 'bd-board', ids }
    expect(() => parseUpdateManyInput({ ...base, patch: {} })).toThrow(
      'No bead updates provided',
    )
    expect(() =>
      parseUpdateManyInput({ ...base, patch: { status: 'closed' } }),
    ).toThrow('Status is invalid')
    expect(() =>
      parseUpdateManyInput({ ...base, patch: { status: 'nope' } }),
    ).toThrow('Status is invalid')
    expect(() =>
      parseUpdateManyInput({ ...base, patch: { priority: 5 } }),
    ).toThrow('Priority is invalid')
    expect(() =>
      parseUpdateManyInput({ ...base, patch: { addLabels: ['bad label'] } }),
    ).toThrow('Label is invalid')
    expect(() =>
      parseUpdateManyInput({ ...base, patch: { due: 'a\nb' } }),
    ).toThrow('due is invalid')
    expect(() =>
      parseUpdateManyInput({ ...base, patch: { assignee: '--force' } }),
    ).toThrow('assignee is invalid')
  })

  it('requires 1 to 200 ids that are each a valid bead id', () => {
    const patch = { priority: 1 }
    const many = (n: number) => Array.from({ length: n }, (_, i) => `bd-${i}`)
    expect(() =>
      parseUpdateManyInput({ project: 'bd-board', ids: [], patch }),
    ).toThrow('Select at least one bead')
    expect(
      parseUpdateManyInput({ project: 'bd-board', ids: many(200), patch }).ids,
    ).toHaveLength(200)
    expect(() =>
      parseUpdateManyInput({ project: 'bd-board', ids: many(201), patch }),
    ).toThrow('Too many beads')
    expect(() =>
      parseUpdateManyInput({
        project: 'bd-board',
        ids: ['bd-1', '--force'],
        patch,
      }),
    ).toThrow('Bead id is invalid')
    expect(() =>
      parseCloseManyInput({ project: 'bd-board', ids: 'bd-1' }),
    ).toThrow('ids must be a list')
    expect(() =>
      parseCloseManyInput({ project: 'bd-board', ids: ['-x'] }),
    ).toThrow('Bead id is invalid')
  })

  it('drops duplicate ids and parses the close options', () => {
    expect(
      parseCloseManyInput({
        project: 'bd-board',
        ids: ['bd-1', 'bd-1', 'bd-2'],
        reason: '  done  ',
        force: true,
      }),
    ).toEqual({
      project: 'bd-board',
      ids: ['bd-1', 'bd-2'],
      reason: 'done',
      force: true,
    })
    expect(parseCloseManyInput({ project: 'bd-board', ids: ['bd-1'] })).toEqual(
      { project: 'bd-board', ids: ['bd-1'], reason: undefined, force: false },
    )
  })
})
