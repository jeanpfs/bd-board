import * as os from 'node:os'
import * as path from 'node:path'
import { describe, expect, it } from 'vitest'

import {
  buildBeadGraph,
  buildCountsFromGroups,
  buildDeleteBeadArgs,
  buildPreviewDeleteBeadArgs,
  buildProjectKnowledge,
  buildUpdateBeadArgs,
  COMMENTS_LIMIT,
  expandHome,
  KNOWLEDGE_LIMIT,
  splitConfiguredRoots,
} from './bd'

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
    expect(
      buildUpdateBeadArgs('bd-board-a2k', { labels: [] }, ['old', 'ui']),
    ).toEqual([
      'update',
      'bd-board-a2k',
      '--remove-label',
      'old',
      '--remove-label',
      'ui',
    ])
  })
})

describe('delete bead arguments', () => {
  it('keeps preview and confirmed delete commands separate', () => {
    expect(buildPreviewDeleteBeadArgs('bd-board-a2k')).toEqual([
      'delete',
      'bd-board-a2k',
    ])
    expect(buildDeleteBeadArgs('bd-board-a2k')).toEqual([
      'delete',
      'bd-board-a2k',
      '--force',
    ])
  })
})

describe('splitConfiguredRoots', () => {
  it('splits roots with the platform delimiter', () => {
    expect(splitConfiguredRoots('/Users/me/Code:/tmp/work', ':')).toEqual([
      '/Users/me/Code',
      '/tmp/work',
    ])
    expect(splitConfiguredRoots('C:\\Code;D:\\work', ';')).toEqual([
      'C:\\Code',
      'D:\\work',
    ])
  })
})

describe('expandHome', () => {
  it('expands a bare tilde to the home directory', () => {
    expect(expandHome('~')).toBe(os.homedir())
  })

  it('expands a tilde-prefixed path', () => {
    expect(expandHome('~/Code')).toBe(path.join(os.homedir(), 'Code'))
  })

  it('leaves absolute paths unchanged', () => {
    expect(expandHome('/Users/me/Code')).toBe('/Users/me/Code')
  })

  it('leaves relative non-tilde paths unchanged', () => {
    expect(expandHome('../Code')).toBe('../Code')
  })
})

describe('buildCountsFromGroups', () => {
  it('maps bd count --by-status groups into ProjectCounts', () => {
    expect(
      buildCountsFromGroups([
        { group: 'open', count: 16 },
        { group: 'blocked', count: 9 },
      ]),
    ).toEqual({
      open: 16,
      in_progress: 0,
      blocked: 9,
      closed: 0,
      deferred: 0,
      total: 25,
    })
  })

  it('returns all-zero counts for an empty group list', () => {
    expect(buildCountsFromGroups([])).toEqual({
      open: 0,
      in_progress: 0,
      blocked: 0,
      closed: 0,
      deferred: 0,
      total: 0,
    })
  })

  it('folds the hooked group into in_progress', () => {
    expect(buildCountsFromGroups([{ group: 'hooked', count: 3 }])).toEqual({
      open: 0,
      in_progress: 3,
      blocked: 0,
      closed: 0,
      deferred: 0,
      total: 3,
    })
  })
})

describe('buildBeadGraph', () => {
  const issue = (
    id: string,
    dependencies?: Record<string, unknown>[],
    extra: Record<string, unknown> = {},
  ) => ({
    id,
    title: `Issue ${id}`,
    status: 'open',
    priority: 2,
    issue_type: 'task',
    ...(dependencies ? { dependencies } : {}),
    ...extra,
  })

  const edge = (from: string, to: string, type = 'blocks') => ({
    issue_id: from,
    depends_on_id: to,
    type,
  })

  it('reads blocks edges from the list payload in both directions', () => {
    const [fvs, nyu] = buildBeadGraph([
      issue('ravo-fvs', [edge('ravo-fvs', 'ravo-nyu')]),
      issue('ravo-nyu'),
    ])

    expect(fvs.links).toEqual([
      { id: 'ravo-nyu', type: 'blocks', direction: 'outgoing' },
    ])
    expect(nyu.links).toEqual([
      { id: 'ravo-fvs', type: 'blocks', direction: 'incoming' },
    ])
  })

  it('derives parent and children from parent-child edges', () => {
    const [epic, child] = buildBeadGraph([
      issue('ravo-epic', undefined, { issue_type: 'epic' }),
      issue('ravo-sub', [edge('ravo-sub', 'ravo-epic', 'parent-child')]),
    ])

    expect(child.parent).toBe('ravo-epic')
    expect(epic.children).toEqual(['ravo-sub'])
    expect(epic.childBeads?.map((b) => b.id)).toEqual(['ravo-sub'])
  })

  it('keeps the parent field emitted by bd when there is no parent-child edge', () => {
    const [epic] = buildBeadGraph([
      issue('ravo-epic', undefined, { issue_type: 'epic' }),
      issue('ravo-sub', undefined, { parent: 'ravo-epic' }),
    ])

    expect(epic.children).toEqual(['ravo-sub'])
  })

  it('keeps non-blocking edge types with their own type', () => {
    const [bug, source] = buildBeadGraph([
      issue('ravo-14f', [edge('ravo-14f', 'ravo-c4d', 'discovered-from')]),
      issue('ravo-c4d'),
    ])

    expect(bug.links).toEqual([
      { id: 'ravo-c4d', type: 'discovered-from', direction: 'outgoing' },
    ])
    expect(source.links).toEqual([
      { id: 'ravo-14f', type: 'discovered-from', direction: 'incoming' },
    ])
  })

  it('ignores the expanded dependency shape returned by bd show', () => {
    const [bead] = buildBeadGraph([
      issue('ravo-fvs', [
        { id: 'ravo-nyu', title: 'Expanded', dependency_type: 'blocks' },
      ]),
    ])

    expect(bead.links ?? []).toEqual([])
  })

  it('drops duplicated edges and edges pointing at unknown beads', () => {
    const [bead] = buildBeadGraph([
      issue('ravo-fvs', [
        edge('ravo-fvs', 'ravo-nyu'),
        edge('ravo-fvs', 'ravo-nyu'),
        edge('ravo-fvs', 'ravo-gone'),
      ]),
      issue('ravo-nyu'),
    ])

    expect(bead.links).toEqual([
      { id: 'ravo-nyu', type: 'blocks', direction: 'outgoing' },
    ])
  })
})

describe('buildProjectKnowledge', () => {
  it('combines comments from every issue, newest first, with bead_title attached', () => {
    const result = buildProjectKnowledge([
      {
        id: 'ravo-fvs',
        title: 'Primeiro deploy manual',
        comments: [
          {
            id: 'c1',
            issue_id: 'ravo-fvs',
            author: 'Jean',
            text: 'ping',
            created_at: '2026-08-10T00:00:00Z',
          },
        ],
      },
      {
        id: 'ravo-cbf',
        title: 'Ligar backup automático',
        comments: [
          {
            id: 'c2',
            issue_id: 'ravo-cbf',
            author: 'Jean',
            text: 'LEARNED: backups precisam de restore testado',
            created_at: '2026-08-12T00:00:00Z',
          },
        ],
      },
    ])

    expect(result.comments.map((c) => c.id)).toEqual(['c2', 'c1'])
    expect(result.comments[0]).toMatchObject({
      bead_id: 'ravo-cbf',
      bead_title: 'Ligar backup automático',
    })
  })

  it('surfaces tagged comments in knowledge with type and content, plain comments only in comments', () => {
    const result = buildProjectKnowledge([
      {
        id: 'ravo-cbf',
        title: 'Ligar backup automático',
        comments: [
          {
            id: 'c1',
            issue_id: 'ravo-cbf',
            author: 'Jean',
            text: 'LEARNED: backups precisam de restore testado',
            created_at: '2026-08-12T00:00:00Z',
          },
          {
            id: 'c2',
            issue_id: 'ravo-cbf',
            author: 'Jean',
            text: 'just a note',
            created_at: '2026-08-11T00:00:00Z',
          },
        ],
      },
    ])

    expect(result.comments.map((c) => c.id)).toEqual(['c1', 'c2'])
    expect(result.knowledge).toHaveLength(1)
    expect(result.knowledge[0]).toMatchObject({
      id: 'c1',
      type: 'learned',
      content: 'backups precisam de restore testado',
    })
  })

  it('handles issues with no comments field without throwing', () => {
    expect(
      buildProjectKnowledge([{ id: 'ravo-nyu', title: 'No comments' }]),
    ).toEqual({
      comments: [],
      knowledge: [],
    })
  })

  it('truncates comments and knowledge to their configured limits', () => {
    const manyComments = Array.from(
      { length: COMMENTS_LIMIT + 20 },
      (_, i) => ({
        id: `c${i}`,
        issue_id: 'ravo-many',
        author: 'Jean',
        text: `LEARNED: entry ${i}`,
        created_at: `2026-08-${String((i % 28) + 1).padStart(2, '0')}T00:00:00Z`,
      }),
    )

    const result = buildProjectKnowledge([
      { id: 'ravo-many', title: 'Many comments', comments: manyComments },
    ])

    expect(result.comments).toHaveLength(COMMENTS_LIMIT)
    expect(result.knowledge).toHaveLength(
      Math.min(KNOWLEDGE_LIMIT, manyComments.length),
    )
  })
})
