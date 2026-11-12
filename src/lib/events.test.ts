import { describe, expect, it } from 'vitest'

import type { Bead } from './types'
import {
  describeEvents,
  groupByDay,
  isForMe,
  parseEventLines,
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

  it('throws on a line that is not JSON instead of dropping it', () => {
    expect(() => parseEventLines('{"seq":1}\nnot json')).toThrow()
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
      verb: 'updated',
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
      detail: 'Shipped in v2.14, migration ran in prod.',
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
  it('counts only items newer than the read cursor', () => {
    const items = describeEvents(
      [
        { seq: 3, ts: 't', op: 'delete', issue_id: 'a', actor: 'x' },
        { seq: 4, ts: 't', op: 'delete', issue_id: 'b', actor: 'x' },
        { seq: 5, ts: 't', op: 'delete', issue_id: 'c', actor: 'x' },
      ],
      new Map(),
    )

    expect(unreadCount(items, 0)).toBe(3)
    expect(unreadCount(items, 4)).toBe(1)
    expect(unreadCount(items, 5)).toBe(0)
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
