import { describe, expect, it } from 'vitest'

import type { Bead } from './types'
import {
  describeEvents,
  formatClock,
  groupByDay,
  isForMe,
  parseEventLines,
  resumeAfterFloor,
  tailArgs,
  tailResult,
  unreadCount,
} from './events'
import type { BdEvent } from './events'

function bead(over: Partial<Bead> & { id: string }): Bead {
  return {
    title: 'Schedule model',
    status: 'open',
    priority: 2,
    issue_type: 'task',
    ...over,
  }
}

function line(event: Record<string, unknown>): string {
  return JSON.stringify(event)
}

describe('parseEventLines', () => {
  it('parses one event per non-blank line', () => {
    const text = [
      line({
        seq: 1,
        ts: '2026-11-11T22:32:31Z',
        op: 'create',
        issue_id: 'x-1',
        actor: 'maya',
        issue: bead({ id: 'x-1' }),
      }),
      '',
      line({
        seq: 2,
        ts: '2026-11-11T22:33:00Z',
        op: 'comment',
        issue_id: 'x-1',
        comment: { text: 'hi', author: 'ines' },
      }),
      '',
    ].join('\n')

    const parsed = parseEventLines(text)

    expect(parsed.events.map((e) => e.seq)).toEqual([1, 2])
    expect(parsed.events[1].comment).toEqual({ text: 'hi', author: 'ines' })
    expect(parsed.truncated).toBeUndefined()
  })

  it('returns no events for empty output (since is past the head)', () => {
    expect(parseEventLines('')).toEqual({ events: [] })
    expect(parseEventLines('\n  \n')).toEqual({ events: [] })
  })

  it('reports the floor and head when the journal was truncated', () => {
    const text = line({
      code: 'events_journal_truncated',
      since: 3,
      floor: 40,
      head: 97,
    })

    expect(parseEventLines(text)).toEqual({
      events: [],
      truncated: { floor: 40, head: 97 },
    })
  })

  it('skips lines that are not JSON or carry no numeric seq', () => {
    const text = [
      '{"seq":1,"ts":"t","op":"delete","issue_id":"a"}',
      'not json',
      '[1,2]',
      '{"seq":"2"}',
    ].join('\n')
    expect(parseEventLines(text).events.map((e) => e.seq)).toEqual([1])
  })
})

describe('describeEvents', () => {
  it('describes a status change as the old and new status', () => {
    const [item] = describeEvents(
      [
        {
          seq: 5,
          ts: '2026-11-11T10:00:00Z',
          op: 'update',
          issue_id: 'ldg-8e7',
          actor: 'dev',
          issue: bead({
            id: 'ldg-8e7',
            status: 'in_progress',
            title: 'PDF export drops footer',
          }),
        },
      ],
      new Map([['ldg-8e7', bead({ id: 'ldg-8e7', status: 'open' })]]),
    )

    expect(item).toMatchObject({
      seq: 5,
      actor: 'dev',
      issueId: 'ldg-8e7',
      title: 'PDF export drops footer',
      verb: 'moved',
      detail: 'Open → In progress',
    })
  })

  it('says claimed when the actor takes an unassigned bead, and notes the move', () => {
    const [item] = describeEvents(
      [
        {
          seq: 6,
          ts: '2026-11-11T10:01:00Z',
          op: 'update',
          issue_id: 'ldg-698.2',
          actor: 'claude-code',
          issue: bead({
            id: 'ldg-698.2',
            status: 'in_progress',
            assignee: 'claude-code',
          }),
        },
      ],
      new Map([['ldg-698.2', bead({ id: 'ldg-698.2', status: 'open' })]]),
    )

    expect(item).toMatchObject({
      verb: 'claimed',
      detail: 'assigned, moved to In progress',
    })
  })

  it('says claimed with no previous record when the bead started within 5s of the event', () => {
    const [item] = describeEvents(
      [
        {
          seq: 7,
          ts: '2026-11-11T10:01:00Z',
          op: 'update',
          issue_id: 'ldg-698.4',
          actor: 'claude-code',
          issue: bead({
            id: 'ldg-698.4',
            status: 'in_progress',
            assignee: 'claude-code',
            started_at: '2026-11-11T10:00:57Z',
          }),
        },
      ],
      new Map(),
    )

    expect(item).toMatchObject({ verb: 'claimed' })
  })

  it('does not say claimed with no previous record and no started_at', () => {
    const [item] = describeEvents(
      [
        {
          seq: 8,
          ts: '2026-11-11T10:01:00Z',
          op: 'update',
          issue_id: 'ldg-698.5',
          actor: 'claude-code',
          issue: bead({
            id: 'ldg-698.5',
            status: 'in_progress',
            assignee: 'claude-code',
          }),
        },
      ],
      new Map(),
    )

    expect(item.verb).not.toBe('claimed')
  })

  it('describes a due date change without a previous record as the new due date', () => {
    const [item] = describeEvents(
      [
        {
          seq: 7,
          ts: '2026-11-11T10:02:00Z',
          op: 'update',
          issue_id: 'x-1',
          actor: 'maya',
          issue: bead({ id: 'x-1', due_at: '2026-12-01T00:00:00Z' }),
        },
      ],
      new Map(),
    )

    expect(item).toMatchObject({ verb: 'updated', detail: 'due 2026-12-01' })
  })

  it('skips derived updates that carry no actor', () => {
    const items = describeEvents(
      [
        {
          seq: 27,
          ts: '2026-11-11T10:03:00Z',
          op: 'update',
          issue_id: 'demo-20j',
          issue: bead({ id: 'demo-20j', status: 'open' }),
        },
      ],
      new Map(),
    )

    expect(items).toEqual([])
  })

  it('describes a close with its reason', () => {
    const [item] = describeEvents(
      [
        {
          seq: 8,
          ts: '2026-11-11T10:04:00Z',
          op: 'close',
          issue_id: 'ldg-axk.1',
          actor: 'dev',
          issue: bead({
            id: 'ldg-axk.1',
            status: 'closed',
            close_reason: 'Shipped in v2.14, migration ran in prod.',
          }),
        },
      ],
      new Map(),
    )

    expect(item).toMatchObject({
      verb: 'closed',
      detail: 'closed · reason “Shipped in v2.14, migration ran in prod.”',
    })
  })

  it('quotes the comment text and attributes it to the comment author', () => {
    const [item] = describeEvents(
      [
        {
          seq: 9,
          ts: '2026-11-11T10:05:00Z',
          op: 'comment',
          issue_id: 'ldg-qj1',
          issue: bead({ id: 'ldg-qj1', title: 'Duplicate payment webhook' }),
          comment: { id: 'c1', text: 'Reproduced twice', author: 'ines' },
        },
      ],
      new Map(),
    )

    expect(item).toMatchObject({
      actor: 'ines',
      verb: 'commented on',
      quote: 'Reproduced twice',
    })
  })

  it('describes a blocking dependency by its target', () => {
    const [item] = describeEvents(
      [
        {
          seq: 10,
          ts: '2026-11-11T10:06:00Z',
          op: 'dep_add',
          issue_id: 'ldg-axk.3',
          actor: 'maya',
          dep: { kind: 'blocks', target: 'ldg-axk.2' },
        },
      ],
      new Map(),
    )

    expect(item).toMatchObject({
      verb: 'added a blocker to',
      detail: 'blocked by ldg-axk.2',
    })
  })

  it('describes a related link by its target', () => {
    const [item] = describeEvents(
      [
        {
          seq: 11,
          ts: '2026-11-11T10:07:00Z',
          op: 'dep_add',
          issue_id: 'x-1',
          actor: 'maya',
          dep: { kind: 'relates-to', target: 'x-2' },
        },
      ],
      new Map(),
    )

    expect(item).toMatchObject({ verb: 'linked', detail: 'related to x-2' })
  })

  it('keeps the input order and records who the bead involves', () => {
    const events: BdEvent[] = [
      {
        seq: 12,
        ts: '2026-11-11T10:08:00Z',
        op: 'create',
        issue_id: 'x-3',
        actor: 'maya',
        issue: bead({ id: 'x-3', assignee: 'ines', created_by: 'maya' }),
      },
      {
        seq: 13,
        ts: '2026-11-11T10:09:00Z',
        op: 'delete',
        issue_id: 'x-4',
        actor: 'dev',
      },
    ]

    const items = describeEvents(events, new Map())

    expect(items.map((i) => i.seq)).toEqual([12, 13])
    expect(items[0].involves).toEqual(['ines', 'maya'])
    expect(items[1].verb).toBe('deleted')
  })
})

describe('isForMe', () => {
  const [assigned] = describeEvents(
    [
      {
        seq: 1,
        ts: '2026-11-11T10:00:00Z',
        op: 'update',
        issue_id: 'x-1',
        actor: 'dev',
        issue: bead({ id: 'x-1', assignee: 'ines', status: 'in_progress' }),
      },
    ],
    new Map(),
  )

  it('is true for activity by someone else on a bead I own or am assigned', () => {
    expect(isForMe(assigned, 'ines')).toBe(true)
  })

  it('is false for my own actions', () => {
    const [mine] = describeEvents(
      [
        {
          seq: 2,
          ts: '2026-11-11T10:00:00Z',
          op: 'update',
          issue_id: 'x-1',
          actor: 'ines',
          issue: bead({ id: 'x-1', assignee: 'ines', status: 'closed' }),
        },
      ],
      new Map(),
    )

    expect(isForMe(mine, 'ines')).toBe(false)
  })

  it('is false for beads that do not involve me', () => {
    expect(isForMe(assigned, 'maya')).toBe(false)
  })
})

describe('unreadCount', () => {
  const mine = (seq: number, actor: string) => ({
    seq,
    ts: 't',
    op: 'update' as const,
    issue_id: `b${seq}`,
    actor,
    issue: { id: `b${seq}`, assignee: 'maya' } as Bead,
  })
  const items = describeEvents(
    [mine(3, 'x'), mine(4, 'x'), mine(5, 'x')],
    new Map(),
  )

  it('counts only items for me newer than the read cursor', () => {
    expect(unreadCount(items, 0, 'maya')).toBe(3)
    expect(unreadCount(items, 4, 'maya')).toBe(1)
    expect(unreadCount(items, 5, 'maya')).toBe(0)
  })

  it('is zero without an identity, since nothing is for nobody', () => {
    expect(unreadCount(items, 0, null)).toBe(0)
  })
})

describe('groupByDay', () => {
  const now = new Date(2026, 10, 12, 10, 0)
  const at = (day: number, hour: number, minute = 0) => ({
    ts: new Date(2026, 10, day, hour, minute).toISOString(),
  })

  it('splits items by local calendar day, newest group first', () => {
    const groups = groupByDay(
      [at(12, 9, 42), at(11, 23, 59), at(11, 0, 0), at(10, 23, 59)],
      now,
    )

    expect(groups.today).toEqual([at(12, 9, 42)])
    expect(groups.yesterday).toEqual([at(11, 23, 59), at(11, 0, 0)])
    expect(groups.earlier).toEqual([at(10, 23, 59)])
  })

  it('treats the midnight boundary as the start of today', () => {
    const groups = groupByDay([at(12, 0, 0)], now)
    expect(groups.today).toHaveLength(1)
  })
})

describe('tailArgs', () => {
  it('reads JSON after a cursor with a page limit', () => {
    expect(tailArgs(7, { limit: 50 })).toEqual([
      'events',
      'tail',
      '--json',
      '--since',
      '7',
      '--limit',
      '50',
    ])
  })

  it('adds --follow for the live feed', () => {
    expect(tailArgs(0, { follow: true })).toEqual([
      'events',
      'tail',
      '--json',
      '--since',
      '0',
      '--follow',
    ])
  })
})

describe('tailResult', () => {
  const record = '{"seq":1,"ts":"t","op":"delete","issue_id":"a"}'

  it('returns the parsed page with no disabled flag when the journal is on', () => {
    expect(tailResult(record, false).events).toHaveLength(1)
    expect(tailResult(record, false)).not.toHaveProperty('disabled')
  })

  it('flags a disabled journal and keeps records printed with the note', () => {
    expect(tailResult(record, true)).toMatchObject({ disabled: true })
    expect(tailResult(record, true).events).toHaveLength(1)
  })

  it('is an empty page for empty output', () => {
    expect(tailResult('', false)).toEqual({ events: [] })
  })
})

describe('formatClock', () => {
  it('prints 24-hour local time with no leading zero on the hour', () => {
    expect(formatClock(new Date(2026, 10, 12, 9, 5).toISOString())).toBe('9:05')
    expect(formatClock(new Date(2026, 10, 12, 14, 42).toISOString())).toBe(
      '14:42',
    )
  })
})

describe('resumeAfterFloor', () => {
  it('resumes at floor minus one so the floor record itself is read', () => {
    expect(resumeAfterFloor(0, 5)).toBe(4)
  })

  it('moves the cursor forward from a stale position', () => {
    expect(resumeAfterFloor(2, 5)).toBe(4)
  })

  it('returns undefined when the cursor already covers the floor', () => {
    expect(resumeAfterFloor(4, 5)).toBeUndefined()
    expect(resumeAfterFloor(7, 5)).toBeUndefined()
  })
})
