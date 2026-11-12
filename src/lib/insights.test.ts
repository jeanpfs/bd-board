import { describe, expect, it } from 'vitest'

import {
  burnUp,
  cycleByType,
  deltaTone,
  formatDays,
  formatSigned,
  insightsSummary,
  labelStep,
  medianCycleDays,
  trend,
  weeklyBuckets,
} from './insights'

import type { Bead } from './types'

function bead(over: Partial<Bead> & { id: string }): Bead {
  return {
    title: over.id,
    status: 'open',
    priority: 2,
    issue_type: 'task',
    ...over,
  }
}

/** Local-time ISO string so the tests hold in any timezone. */
function local(y: number, m: number, d: number, h = 12): string {
  return new Date(y, m - 1, d, h).toISOString()
}

// Wednesday 2026-11-11, local.
const NOW = new Date(2026, 10, 11, 15)

describe('weeklyBuckets', () => {
  it('returns oldest to newest, every bucket starting on a local Monday', () => {
    const buckets = weeklyBuckets([], NOW, 3)
    expect(buckets.map((b) => b.start.getDay())).toEqual([1, 1, 1])
    expect(buckets[2].start).toEqual(new Date(2026, 10, 9))
    expect(buckets[0].start).toEqual(new Date(2026, 9, 26))
  })

  it('puts Sunday night in the old week and Monday morning in the new one', () => {
    const buckets = weeklyBuckets(
      [
        bead({ id: 'a', created_at: local(2026, 11, 8, 23) }),
        bead({ id: 'b', created_at: local(2026, 11, 9, 0) }),
      ],
      NOW,
      2,
    )
    expect(buckets.map((b) => b.created)).toEqual([1, 1])
  })

  it('counts created and closed separately and ignores out-of-range, gates and undated beads', () => {
    const buckets = weeklyBuckets(
      [
        bead({
          id: 'a',
          created_at: local(2026, 11, 10),
          closed_at: local(2026, 11, 11),
          status: 'closed',
        }),
        bead({ id: 'old', created_at: local(2026, 1, 1) }),
        bead({
          id: 'g',
          issue_type: 'gate',
          created_at: local(2026, 11, 10),
        }),
        bead({ id: 'nodate' }),
      ],
      NOW,
      2,
    )
    expect(buckets.map((b) => [b.created, b.closed])).toEqual([
      [0, 0],
      [1, 1],
    ])
  })
})

describe('burnUp', () => {
  it('is cumulative and includes work created before the range', () => {
    const points = burnUp(
      [
        bead({ id: 'old', created_at: local(2026, 1, 1) }),
        bead({
          id: 'a',
          created_at: local(2026, 11, 3),
          closed_at: local(2026, 11, 10),
          status: 'closed',
        }),
        bead({ id: 'b', created_at: local(2026, 11, 10) }),
      ],
      NOW,
      2,
    )
    expect(points.map((p) => [p.scope, p.done])).toEqual([
      [2, 0],
      [3, 1],
    ])
  })
})

describe('medianCycleDays', () => {
  const closed = (id: string, start: string, end: string, type = 'task') =>
    bead({
      id,
      status: 'closed',
      issue_type: type,
      started_at: start,
      closed_at: end,
    })

  it('takes the middle value for an odd count', () => {
    const beads = [
      closed('a', local(2026, 11, 1), local(2026, 11, 2)),
      closed('b', local(2026, 11, 1), local(2026, 11, 4)),
      closed('c', local(2026, 11, 1), local(2026, 11, 11)),
    ]
    expect(medianCycleDays(beads)).toBeCloseTo(3)
  })

  it('averages the two middle values for an even count', () => {
    const beads = [
      closed('a', local(2026, 11, 1), local(2026, 11, 2)),
      closed('b', local(2026, 11, 1), local(2026, 11, 4)),
    ]
    expect(medianCycleDays(beads)).toBeCloseTo(2)
  })

  it('skips beads without started_at or closed_at, and null when none qualify', () => {
    const noStart = bead({
      id: 'x',
      status: 'closed',
      closed_at: local(2026, 11, 2),
    })
    expect(medianCycleDays([noStart])).toBeNull()
    expect(
      medianCycleDays([
        noStart,
        closed('a', local(2026, 11, 1), local(2026, 11, 3)),
      ]),
    ).toBeCloseTo(2)
  })

  it('filters by type', () => {
    const beads = [
      closed('a', local(2026, 11, 1), local(2026, 11, 2), 'bug'),
      closed('b', local(2026, 11, 1), local(2026, 11, 9), 'task'),
    ]
    expect(medianCycleDays(beads, ['bug'])).toBeCloseTo(1)
  })
})

describe('cycleByType', () => {
  it('lists each type with its median and count, slowest first, gates excluded', () => {
    const rows = cycleByType(
      [
        bead({
          id: 'a',
          issue_type: 'bug',
          started_at: local(2026, 11, 1),
          closed_at: local(2026, 11, 2),
        }),
        bead({
          id: 'b',
          issue_type: 'task',
          started_at: local(2026, 11, 1),
          closed_at: local(2026, 11, 5),
        }),
        bead({
          id: 'c',
          issue_type: 'task',
          started_at: local(2026, 11, 1),
          closed_at: local(2026, 11, 3),
        }),
        bead({
          id: 'g',
          issue_type: 'gate',
          started_at: local(2026, 11, 1),
          closed_at: local(2026, 11, 9),
        }),
      ],
      NOW,
      4,
    )
    expect(rows.map((r) => [r.type, r.count])).toEqual([
      ['task', 2],
      ['bug', 1],
    ])
    expect(rows[0].days).toBeCloseTo(3)
  })

  it('ignores beads closed before the range', () => {
    const rows = cycleByType(
      [
        bead({
          id: 'old',
          issue_type: 'bug',
          started_at: local(2026, 8, 1),
          closed_at: local(2026, 8, 20),
        }),
      ],
      NOW,
      4,
    )
    expect(rows).toEqual([])
  })
})

describe('formatSigned', () => {
  it('signs non-zero values with a real minus and leaves zero unsigned', () => {
    expect(formatSigned(0.5, 1)).toBe('+0.5')
    expect(formatSigned(-0.6, 1)).toBe('−0.6')
    expect(formatSigned(0.04, 1)).toBe('0.0')
    expect(formatSigned(-0.04, 1)).toBe('0.0')
  })
})

describe('formatDays', () => {
  it('keeps one decimal with a d suffix', () => {
    expect(formatDays(2.4)).toBe('2.4d')
    expect(formatDays(12)).toBe('12.0d')
  })
})

describe('deltaTone', () => {
  it('is green when the change points the good way, red otherwise, flat for no change', () => {
    expect(deltaTone(1, true)).toBe('good')
    expect(deltaTone(-1, true)).toBe('bad')
    expect(deltaTone(-1, false)).toBe('good')
    expect(deltaTone(1, false)).toBe('bad')
    expect(deltaTone(0, false)).toBe('flat')
  })
})

describe('labelStep', () => {
  it('thins axis labels as the range grows', () => {
    expect([labelStep(4), labelStep(8), labelStep(13)]).toEqual([1, 2, 3])
  })
})

describe('trend', () => {
  it('signs the change and calls tiny differences flat', () => {
    expect(trend(3, 2.5)).toBe(1)
    expect(trend(2, 2.5)).toBe(-1)
    expect(trend(2, 2)).toBe(0)
    expect(trend(2.0000001, 2)).toBe(0)
  })
})

describe('insightsSummary', () => {
  it('compares the range with the one before it and counts open P0-P1 and overdue', () => {
    const beads = [
      // closed this week, cycle 1d
      bead({
        id: 'now1',
        status: 'closed',
        created_at: local(2026, 11, 2),
        started_at: local(2026, 11, 9),
        closed_at: local(2026, 11, 10),
      }),
      // closed in the previous week, cycle 5d
      bead({
        id: 'prev1',
        status: 'closed',
        created_at: local(2026, 11, 1),
        started_at: local(2026, 11, 2),
        closed_at: local(2026, 11, 7),
      }),
      bead({ id: 'p0', priority: 0, due_at: local(2026, 11, 1) }),
      bead({ id: 'p1', priority: 1 }),
      bead({ id: 'p2', priority: 2 }),
      bead({ id: 'gate', priority: 0, issue_type: 'gate' }),
    ]
    const s = insightsSummary(beads, 1, NOW)
    expect(s.perWeek).toBe(1)
    expect(s.perWeekPrev).toBe(1)
    expect(s.medianDays).toBeCloseTo(1)
    expect(s.medianDaysPrev).toBeCloseTo(5)
    expect(s.openUrgent).toBe(2)
    expect(s.overdue).toBe(1)
  })
})
