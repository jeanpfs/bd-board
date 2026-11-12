import { mkdir, mkdtemp, rm, writeFile } from 'node:fs/promises'
import * as os from 'node:os'
import * as path from 'node:path'

import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

import {
  buildQueryArgs,
  buildParseQueryArgs,
  buildKvGetArgs,
  buildKvSetArgs,
  parseKvGet,
  buildGetConfigArgs,
  buildSetConfigArgs,
  buildListGatesArgs,
  buildReclaimBeadArgs,
  asRows,
  inTurn,
  mergeGateRows,
  parseReclaimCount,
  buildResolveGateArgs,
  buildUnclaimBeadArgs,
  buildBeadGraph,
  buildClaimArgs,
  buildCloseBeadArgs,
  buildCloseManyArgs,
  buildUpdateManyArgs,
  buildStaleArgs,
  buildReadyExplainArgs,
  buildCountsFromGroups,
  buildDeferBeadArgs,
  buildCreateBeadArgs,
  buildDeleteBeadArgs,
  buildListBeadsArgs,
  buildPreviewDeleteBeadArgs,
  buildProjectKnowledge,
  buildUndeferBeadArgs,
  buildUpdateBeadArgs,
  COMMENTS_LIMIT,
  deletionSet,
  KNOWLEDGE_LIMIT,
  parseStatusCategories,
  resolveDir,
  unlinkedDependents,
  buildShowBeadArgs,
  mapBeadDetail,
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

describe('buildShowBeadArgs', () => {
  it('asks for dependents so the detail can list what is blocked by this bead', () => {
    expect(buildShowBeadArgs('bd-a')).toEqual([
      'show',
      'bd-a',
      '--include-dependents',
      '--json',
    ])
  })
})

describe('mapBeadDetail', () => {
  const issue = (id: string, extra: Record<string, unknown> = {}) => ({
    id,
    title: `Title ${id}`,
    status: 'open',
    issue_type: 'task',
    ...extra,
  })

  it('maps dependencies and dependents with their dependency types', () => {
    const detail = mapBeadDetail(
      [
        issue('bd-a', {
          dependencies: [issue('bd-up', { dependency_type: 'blocks' })],
          dependents: [
            {
              id: 'bd-down',
              title: 'Down',
              status: 'open',
              issue_type: 'task',
              dependency_type: 'relates-to',
              created_at: '0001-01-01T00:00:00Z',
            },
          ],
        }),
      ],
      [],
    )
    expect(detail.dependencies?.map((d) => [d.id, d.dependency_type])).toEqual([
      ['bd-up', 'blocks'],
    ])
    expect(detail.dependents).toEqual([
      {
        id: 'bd-down',
        title: 'Down',
        status: 'open',
        issue_type: 'task',
        dependency_type: 'relates-to',
      },
    ])
  })

  it('returns no dependents when bd omits them', () => {
    const detail = mapBeadDetail([issue('bd-a')], [])
    expect(detail.dependents).toEqual([])
  })
})

describe('delete bead arguments', () => {
  it('previews and deletes the explicit set, never with --cascade', () => {
    const ids = ['bd-board-a2k', 'bd-board-a2k.1']
    expect(buildPreviewDeleteBeadArgs(ids)).toEqual([
      'delete',
      'bd-board-a2k',
      'bd-board-a2k.1',
    ])
    expect(buildDeleteBeadArgs(ids)).toEqual([
      'delete',
      'bd-board-a2k',
      'bd-board-a2k.1',
      '--force',
    ])
  })
})

describe('deletionSet', () => {
  const beads = buildBeadGraph([
    { id: 'ep', title: 'Epic', status: 'open' },
    { id: 'ep.1', title: 'Child', status: 'open', parent: 'ep' },
    { id: 'ep.1.1', title: 'Grandchild', status: 'open', parent: 'ep.1' },
    { id: 'other', title: 'Other', status: 'open' },
    {
      id: 'blocked',
      title: 'Blocked by the child',
      status: 'open',
      dependencies: [
        { issue_id: 'blocked', depends_on_id: 'ep.1', type: 'blocks' },
      ],
    },
  ])

  it('takes the bead and every parent-child descendant', () => {
    expect(deletionSet(beads, 'ep')).toEqual(['ep', 'ep.1', 'ep.1.1'])
    expect(deletionSet(beads, 'ep.1.1')).toEqual(['ep.1.1'])
  })

  it('keeps beads that only depend on the subtree and reports them', () => {
    const ids = deletionSet(beads, 'ep')
    expect(ids).not.toContain('blocked')
    expect(unlinkedDependents(beads, ids)).toEqual([
      { id: 'blocked', title: 'Blocked by the child', type: 'blocks' },
    ])
  })
})

describe('closeBead arguments', () => {
  it('adds the reason and force only when given', () => {
    expect(buildCloseBeadArgs('x-1', {})).toEqual(['close', 'x-1'])
    expect(buildCloseBeadArgs('x-1', { reason: 'dup', force: true })).toEqual([
      'close',
      'x-1',
      '--reason',
      'dup',
      '--force',
    ])
  })
})

describe('createBead arguments', () => {
  it('passes labels as one comma-separated --labels flag', () => {
    expect(
      buildCreateBeadArgs({ title: 'Fix', labels: ['ui', 'pdf'] }),
    ).toEqual(['create', '--title', 'Fix', '--silent', '--labels', 'ui,pdf'])
  })

  it('omits --labels when no labels are given', () => {
    expect(buildCreateBeadArgs({ title: 'Fix' })).toEqual([
      'create',
      '--title',
      'Fix',
      '--silent',
    ])
    expect(buildCreateBeadArgs({ title: 'Fix', labels: [] })).not.toContain(
      '--labels',
    )
  })
})

describe('schedule arguments', () => {
  it('passes due and estimate to bd update', () => {
    expect(
      buildUpdateBeadArgs('x-1', { due: 'tomorrow', estimate: 180 }),
    ).toEqual(['update', 'x-1', '--due', 'tomorrow', '--estimate', '180'])
  })

  it('clears the due date with an empty --due', () => {
    expect(buildUpdateBeadArgs('x-1', { due: '' })).toEqual([
      'update',
      'x-1',
      '--due',
      '',
    ])
  })

  it('defers with or without a date', () => {
    expect(buildDeferBeadArgs('x-1')).toEqual(['defer', 'x-1'])
    expect(buildDeferBeadArgs('x-1', 'next monday')).toEqual([
      'defer',
      'x-1',
      '--until',
      'next monday',
    ])
    expect(buildUndeferBeadArgs('x-1')).toEqual(['undefer', 'x-1'])
  })

  it('lists every bead instead of bd’s default page', () => {
    expect(buildListBeadsArgs()).toEqual([
      'list',
      '--all',
      '--limit',
      '0',
      '--json',
    ])
  })
})

describe('resolveDir', () => {
  let home: string

  beforeEach(async () => {
    home = await mkdtemp(path.join(os.tmpdir(), 'bd-board-home-'))
    vi.stubEnv('HOME', home)
    await mkdir(path.join(home, '.config', 'bd-board'), { recursive: true })
    await writeFile(
      path.join(home, '.config', 'bd-board', 'projects.json'),
      JSON.stringify({
        version: 1,
        projects: [
          { id: 'here', path: home, label: 'here' },
          { id: 'gone', path: path.join(home, 'removed'), label: 'gone' },
        ],
      }),
    )
  })

  afterEach(async () => {
    vi.unstubAllEnvs()
    await rm(home, { recursive: true, force: true })
  })

  it('returns the registered folder', async () => {
    await expect(resolveDir('here')).resolves.toBe(home)
  })

  it('reports a removed project folder instead of a missing bd binary', async () => {
    await expect(resolveDir('gone')).rejects.toThrow(
      `project directory no longer exists: ${path.join(home, 'removed')}`,
    )
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

  it('counts custom statuses in the column of their bd category', () => {
    const categories = parseStatusCategories({
      custom_statuses: [
        { name: 'in_review', category: 'wip' },
        { name: 'archived', category: 'done' },
        { name: 'icebox', category: 'frozen' },
        { name: 'plain', category: 'unspecified' },
      ],
    })
    expect(
      buildCountsFromGroups(
        [
          { group: 'in_review', count: 2 },
          { group: 'archived', count: 3 },
          { group: 'icebox', count: 4 },
          { group: 'plain', count: 1 },
          { group: 'unknown', count: 5 },
        ],
        categories,
      ),
    ).toEqual({
      open: 6,
      in_progress: 2,
      blocked: 0,
      closed: 3,
      deferred: 4,
      total: 15,
    })
  })
})

describe('buildBeadGraph', () => {
  it('drops the blocks edge to a resolved gate but keeps it for an open gate', () => {
    const dep = (to: string) => ({
      issue_id: 'w',
      depends_on_id: to,
      type: 'blocks',
    })
    const beads = buildBeadGraph([
      { id: 'g1', title: 'g', status: 'closed', issue_type: 'gate' },
      { id: 'g2', title: 'g', status: 'open', issue_type: 'gate' },
      {
        id: 'w',
        title: 'w',
        status: 'open',
        issue_type: 'task',
        dependencies: [dep('g1'), dep('g2')],
      },
    ])
    const waiting = beads.find((b) => b.id === 'w')
    expect(waiting?.links?.map((l) => l.id)).toEqual(['g2'])
  })

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

describe('claim and ready arguments', () => {
  it('claims atomically, adding the actor when known', () => {
    expect(buildClaimArgs('x-1')).toEqual(['update', 'x-1', '--claim'])
    expect(buildClaimArgs('x-1', 'maya')).toEqual([
      'update',
      'x-1',
      '--claim',
      '--actor',
      'maya',
    ])
  })

  it('asks for every ready bead with explanations', () => {
    expect(buildReadyExplainArgs()).toEqual([
      'ready',
      '--explain',
      '--json',
      '--limit',
      '0',
    ])
  })
})

describe('lease and gate command builders', () => {
  it('lists every gate as JSON', () => {
    expect(buildListGatesArgs()).toEqual(['gate', 'list', '--all', '--json'])
  })

  it('asks for beads stale for N days as JSON with no row cap', () => {
    expect(buildStaleArgs(10)).toEqual([
      'stale',
      '--days',
      '10',
      '--json',
      '--limit',
      '0',
    ])
  })

  it('resolves a gate with plain text output', () => {
    expect(buildResolveGateArgs('g1')).toEqual(['gate', 'resolve', 'g1'])
  })

  it('reclaims a bead whose lease is already expired', () => {
    expect(buildReclaimBeadArgs('ldg-698.1')).toEqual([
      'reclaim',
      '--id',
      'ldg-698.1',
      '--older-than',
      '0s',
      '--json',
    ])
  })

  it('adds gates that bd list hid, without duplicating ones it listed', () => {
    const merged = mergeGateRows(
      [{ id: 'a' }, { id: 'g1', issue_type: 'gate' }],
      [{ id: 'g1' }, { id: 'g2' }],
    )
    expect(merged.map((row) => row['id'])).toEqual(['a', 'g1', 'g2'])
  })

  it('treats bd null output (no gates) as an empty list', () => {
    expect(mergeGateRows([{ id: 'a' }], null)).toEqual([{ id: 'a' }])
    expect(asRows(null)).toEqual([])
    expect(asRows({ error: 'x' })).toEqual([])
    expect(asRows([{ id: 'a' }])).toEqual([{ id: 'a' }])
  })

  it('reads the reclaimed count, including zero when the lease was renewed', () => {
    expect(
      parseReclaimCount('{"count":0,"reclaimed":null,"schema_version":1}'),
    ).toBe(0)
    expect(parseReclaimCount('{"count":1,"reclaimed":["a"]}')).toBe(1)
  })

  it('rejects reclaim output that is not the JSON count', () => {
    expect(() => parseReclaimCount('✓ reclaimed')).toThrow(
      'Unexpected output from bd reclaim',
    )
    expect(() => parseReclaimCount('{"reclaimed":[]}')).toThrow()
  })

  it('adds --force to unclaim only when asked', () => {
    expect(buildUnclaimBeadArgs('ldg-qj1', false)).toEqual([
      'unclaim',
      'ldg-qj1',
    ])
    expect(buildUnclaimBeadArgs('ldg-qj1', true)).toEqual([
      'unclaim',
      'ldg-qj1',
      '--force',
    ])
  })

  it('reads one config key as JSON', () => {
    expect(buildGetConfigArgs('claim.pools')).toEqual([
      'config',
      'get',
      'claim.pools',
      '--json',
    ])
  })
})

describe('buildSetConfigArgs', () => {
  it('writes a value with config set and the --json flag', () => {
    expect(buildSetConfigArgs('status.custom', 'qa:wip')).toEqual([
      'config',
      'set',
      'status.custom',
      'qa:wip',
      '--json',
    ])
  })

  it('keeps an empty value so claim.pools can be cleared', () => {
    expect(buildSetConfigArgs('claim.pools', '')).toEqual([
      'config',
      'set',
      'claim.pools',
      '',
      '--json',
    ])
  })

  it('rejects a flag-like key', () => {
    expect(() => buildSetConfigArgs('--force', 'x')).toThrow()
  })
})

describe('bd query and kv args', () => {
  it('builds a query with the flags that return every match', () => {
    expect(buildQueryArgs('type=bug AND updated>1d')).toEqual([
      'query',
      'type=bug AND updated>1d',
      '--json',
      '--limit',
      '0',
      '--all',
    ])
  })

  it('builds a parse-only check for a query', () => {
    expect(buildParseQueryArgs('type=bug')).toEqual([
      'query',
      'type=bug',
      '--parse-only',
    ])
  })

  it('refuses query and kv values that look like flags', () => {
    expect(() => buildQueryArgs('-x')).toThrow()
    expect(() => buildParseQueryArgs('-x')).toThrow()
    expect(() => buildKvGetArgs('--all')).toThrow()
    expect(() => buildKvSetArgs('-k', 'v')).toThrow()
  })

  it('builds kv get and set args', () => {
    expect(buildKvGetArgs('bd-board.views')).toEqual([
      'kv',
      'get',
      'bd-board.views',
      '--json',
    ])
    expect(buildKvSetArgs('bd-board.views', '[]')).toEqual([
      'kv',
      'set',
      'bd-board.views',
      '[]',
      '--json',
    ])
  })

  it('reads a found kv value', () => {
    expect(
      parseKvGet(
        0,
        '{"found":true,"key":"k","schema_version":1,"value":"v"}',
        '',
      ),
    ).toBe('v')
  })

  it('reads a missing key (exit 1, found:false) as null', () => {
    expect(
      parseKvGet(
        1,
        '{"found":false,"key":"k","schema_version":1,"value":""}',
        '',
      ),
    ).toBeNull()
  })

  it('throws on other kv failures', () => {
    expect(() => parseKvGet(2, '', 'database is locked')).toThrow(
      'database is locked',
    )
  })
})

describe('bulk bd arguments', () => {
  it('puts every id before the flags in one update command', () => {
    expect(
      buildUpdateManyArgs(['x-1', 'x-2', 'x-3'], {
        status: 'in_progress',
        priority: 1,
        assignee: 'maya',
        due: 'tomorrow',
      }),
    ).toEqual([
      'update',
      'x-1',
      'x-2',
      'x-3',
      '--status',
      'in_progress',
      '--priority',
      '1',
      '--assignee',
      'maya',
      '--due',
      'tomorrow',
    ])
  })

  it('repeats --add-label once per label and passes an empty value to clear', () => {
    expect(
      buildUpdateManyArgs(['x-1', 'x-2'], {
        addLabels: ['ui', 'pdf'],
        assignee: '',
        due: '',
      }),
    ).toEqual([
      'update',
      'x-1',
      'x-2',
      '--assignee',
      '',
      '--due',
      '',
      '--add-label',
      'ui',
      '--add-label',
      'pdf',
    ])
  })

  it('closes many ids with the reason and force only when given', () => {
    expect(buildCloseManyArgs(['x-1', 'x-2'], {})).toEqual([
      'close',
      'x-1',
      'x-2',
    ])
    expect(
      buildCloseManyArgs(['x-1', 'x-2'], { reason: 'dup', force: true }),
    ).toEqual(['close', 'x-1', 'x-2', '--reason', 'dup', '--force'])
  })
})

describe('inTurn', () => {
  // The tsconfig lib predates Promise.withResolvers.
  function deferred<T>() {
    let resolve!: (value: T) => void
    const promise = new Promise<T>((done) => {
      resolve = done
    })
    return { promise, resolve }
  }

  it('starts the next call on a project only after the previous one settles', async () => {
    const first = deferred<string>()
    let firstStarted = false
    let secondStarted = false
    const one = inTurn('/p/a', () => {
      firstStarted = true
      return first.promise
    })
    const two = inTurn('/p/a', async () => {
      secondStarted = true
      return 'two'
    })

    await vi.waitFor(() => expect(firstStarted).toBe(true))
    expect(secondStarted).toBe(false)

    first.resolve('one')
    expect(await Promise.all([one, two])).toEqual(['one', 'two'])
    expect(secondStarted).toBe(true)
  })

  it('keeps the queue moving after a failed call', async () => {
    const failed = inTurn('/p/b', () => Promise.reject(new Error('boom')))
    const next = inTurn('/p/b', async () => 'ran')
    await expect(failed).rejects.toThrow('boom')
    await expect(next).resolves.toBe('ran')
  })

  it('runs different projects at the same time', async () => {
    const gate = deferred<void>()
    const started: string[] = []
    const job = (dir: string) =>
      inTurn(dir, async () => {
        started.push(dir)
        await gate.promise
      })
    const both = Promise.all([job('/p/c'), job('/p/d')])

    // Both start while neither has finished.
    await vi.waitFor(() => expect(started).toEqual(['/p/c', '/p/d']))
    gate.resolve()
    await both
  })
})
