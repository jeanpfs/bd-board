import { describe, expect, it } from 'vitest'

import { childDueLabel, epicSpans, scaleTicks } from './timeline'

import type { Bead } from './types'

const NOW = new Date(2026, 10, 11, 12, 0, 0)

function day(month: number, d: number): string {
  return new Date(2026, month - 1, d, 9, 0, 0).toISOString()
}

function bead(id: string, extra: Partial<Bead> = {}): Bead {
  return {
    id,
    title: id,
    status: 'open',
    priority: 2,
    issue_type: 'task',
    ...extra,
  }
}

function epic(id: string, extra: Partial<Bead> = {}): Bead {
  return bead(id, { issue_type: 'epic', ...extra })
}

describe('epicSpans', () => {
  it('leaves an epic with nothing started without a start', () => {
    const [span] = epicSpans(
      [
        epic('e', { due_at: day(12, 18) }),
        bead('e.1', { parent: 'e', due_at: day(11, 20) }),
      ],
      NOW,
    )
    expect(span.start).toBeUndefined()
    expect(span.due).toEqual(new Date(day(12, 18)))
    expect(span.atRisk).toBe(false)
    expect(span.done).toBe(0)
    expect(span.total).toBe(1)
  })

  it('starts at the earliest started_at of the epic or its children', () => {
    const [span] = epicSpans(
      [
        epic('e', { started_at: day(11, 5), due_at: day(12, 30) }),
        bead('e.1', { parent: 'e', started_at: day(11, 2) }),
        bead('e.2', { parent: 'e', started_at: day(11, 8) }),
      ],
      NOW,
    )
    expect(span.start).toEqual(new Date(day(11, 2)))
  })

  it('is on track when the projected finish is before the due date', () => {
    const [span] = epicSpans(
      [
        epic('e', { started_at: day(11, 1), due_at: day(12, 31) }),
        bead('e.1', { parent: 'e', status: 'closed' }),
        bead('e.2', { parent: 'e', status: 'closed' }),
        bead('e.3', { parent: 'e' }),
      ],
      NOW,
    )
    expect(span.done).toBe(2)
    expect(span.total).toBe(3)
    expect(span.atRisk).toBe(false)
  })

  it('is at risk when the current pace finishes after the due date', () => {
    const [span] = epicSpans(
      [
        epic('e', { started_at: day(10, 12), due_at: day(11, 27) }),
        bead('e.1', { parent: 'e', status: 'closed' }),
        bead('e.2', { parent: 'e' }),
        bead('e.3', { parent: 'e' }),
        bead('e.4', { parent: 'e' }),
      ],
      NOW,
    )
    expect(span.atRisk).toBe(true)
  })

  it('is at risk with nothing closed and under a quarter of the window left', () => {
    const [span] = epicSpans(
      [
        epic('e', { started_at: day(11, 1), due_at: day(11, 13) }),
        bead('e.1', { parent: 'e' }),
      ],
      NOW,
    )
    expect(span.atRisk).toBe(true)
  })

  it('is never at risk once every child is closed', () => {
    const [span] = epicSpans(
      [
        epic('e', { started_at: day(10, 1), due_at: day(10, 20) }),
        bead('e.1', { parent: 'e', status: 'closed' }),
      ],
      NOW,
    )
    expect(span.atRisk).toBe(false)
  })

  it('is not at risk without a due date', () => {
    const [span] = epicSpans(
      [epic('e', { started_at: day(10, 1) }), bead('e.1', { parent: 'e' })],
      NOW,
    )
    expect(span.due).toBeUndefined()
    expect(span.atRisk).toBe(false)
  })

  it('lists epics with a due date by due date, then epics without one', () => {
    const spans = epicSpans(
      [
        epic('none'),
        epic('late', { due_at: day(12, 18) }),
        epic('soon', { due_at: day(11, 20) }),
      ],
      NOW,
    )
    expect(spans.map((s) => s.epic.id)).toEqual(['soon', 'late', 'none'])
  })

  it('omits closed epics and gates, keeps children with their due dates', () => {
    const spans = epicSpans(
      [
        epic('closed', { status: 'closed' }),
        bead('g', { issue_type: 'gate' }),
        epic('e'),
        bead('e.1', { parent: 'e', due_at: day(11, 13) }),
        bead('e.gate', { parent: 'e', issue_type: 'gate' }),
        bead('e.2', { parent: 'e' }),
      ],
      NOW,
    )
    expect(spans.map((s) => s.epic.id)).toEqual(['e'])
    expect(spans[0].total).toBe(2)
    expect(spans[0].children.map((c) => c.bead.id)).toEqual(['e.1', 'e.2'])
    expect(spans[0].children[0].due).toEqual(new Date(day(11, 13)))
    expect(spans[0].children[1].due).toBeUndefined()
  })
})

describe('scaleTicks', () => {
  const range = { start: new Date(2026, 10, 2), end: new Date(2026, 11, 28) }

  it('places week ticks on Mondays', () => {
    const ticks = scaleTicks(range, 'week')
    expect(ticks[0]).toEqual(new Date(2026, 10, 2))
    expect(ticks[1]).toEqual(new Date(2026, 10, 9))
    expect(ticks.at(-1)).toEqual(new Date(2026, 11, 28))
    expect(ticks).toHaveLength(9)
  })

  it('places month ticks on the first of the month inside the range', () => {
    expect(scaleTicks(range, 'month')).toEqual([new Date(2026, 11, 1)])
    expect(
      scaleTicks(
        { start: new Date(2026, 9, 31), end: new Date(2027, 0, 15) },
        'month',
      ),
    ).toEqual([
      new Date(2026, 10, 1),
      new Date(2026, 11, 1),
      new Date(2027, 0, 1),
    ])
  })

  it('places quarter ticks on quarter starts inside the range', () => {
    expect(
      scaleTicks(
        { start: new Date(2026, 8, 1), end: new Date(2027, 3, 1) },
        'quarter',
      ),
    ).toEqual([
      new Date(2026, 9, 1),
      new Date(2027, 0, 1),
      new Date(2027, 3, 1),
    ])
  })

  it('returns no ticks for an empty or inverted range', () => {
    const d = new Date(2026, 10, 3)
    expect(
      scaleTicks({ start: d, end: new Date(2026, 10, 2) }, 'week'),
    ).toEqual([])
  })
})

describe('childDueLabel', () => {
  it.each([
    [-2, 'due Nov 9 · overdue 2d', true],
    [0, 'due Nov 11 · today', true],
    [1, 'due Nov 12 · tomorrow', true],
    [2, 'due Nov 13 · in 2 days', true],
    [7, 'due Nov 18 · in 7 days', true],
    [8, 'due Nov 19', false],
  ])('labels %i days out as %j (soon %s)', (offset, text, soon) => {
    const due = new Date(2026, 10, 11 + offset, 9, 0, 0)
    expect(childDueLabel(due, NOW)).toEqual({ text, soon })
  })
})
