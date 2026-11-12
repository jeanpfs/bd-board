import { describe, it, expect } from 'vitest'
import {
  mergeViews,
  newViewId,
  parseViews,
  personalViewsKey,
  queryTextError,
  type SavedView,
} from './views'

const view = (id: string, shared = false): SavedView => ({
  id,
  name: `Name ${id}`,
  query: 'status!=closed',
  shared,
})

describe('parseViews', () => {
  it('returns valid entries and drops invalid ones', () => {
    const json = JSON.stringify([
      { id: 'open-bugs', name: 'Open bugs', query: 'type=bug', shared: true },
      { id: '', name: 'No id', query: 'type=bug' },
      { id: 'no-name', name: '', query: 'type=bug' },
      { id: 'bad id!', name: 'Bad', query: 'type=bug' },
      { id: 'no-query', name: 'Empty query', query: '   ' },
      { id: 'multi', name: 'Multi', query: 'a\nb' },
      'not an object',
      null,
    ])
    expect(parseViews(json)).toEqual([
      { id: 'open-bugs', name: 'Open bugs', query: 'type=bug', shared: true },
    ])
  })

  it('treats a missing shared flag as personal', () => {
    const [v] = parseViews(
      JSON.stringify([{ id: 'a', name: 'A', query: 'type=bug' }]),
    )
    expect(v.shared).toBe(false)
  })

  it('returns an empty list for invalid JSON or non-array JSON', () => {
    expect(parseViews('not json')).toEqual([])
    expect(parseViews('{"id":"a"}')).toEqual([])
    expect(parseViews('')).toEqual([])
  })
})

describe('mergeViews', () => {
  it('lists shared views before personal views', () => {
    const merged = mergeViews([view('s1', true)], [view('p1')])
    expect(merged.map((v) => v.id)).toEqual(['s1', 'p1'])
  })

  it('keeps the shared copy when ids collide', () => {
    const merged = mergeViews(
      [{ ...view('dup', true), name: 'Shared' }],
      [{ ...view('dup'), name: 'Personal' }],
    )
    expect(merged).toHaveLength(1)
    expect(merged[0]).toMatchObject({ name: 'Shared', shared: true })
  })
})

describe('newViewId', () => {
  it('slugifies the name', () => {
    expect(newViewId('My open bugs!', [])).toBe('my-open-bugs')
  })

  it('falls back when the name has no slug characters', () => {
    expect(newViewId('!!!', [])).toBe('view')
  })

  it('adds a numeric suffix when the slug is taken', () => {
    expect(newViewId('Open bugs', ['open-bugs'])).toBe('open-bugs-2')
    expect(newViewId('Open bugs', ['open-bugs', 'open-bugs-2'])).toBe(
      'open-bugs-3',
    )
  })

  it('always produces an id the parser accepts', () => {
    const id = newViewId('x'.repeat(200), [])
    expect(parseViews(JSON.stringify([{ id, name: 'n', query: 'q' }]))).toHaveLength(1)
  })
})

describe('personalViewsKey', () => {
  it('scopes the localStorage key by project', () => {
    expect(personalViewsKey('ledger')).toBe('bd-board:views:ledger')
  })
})

describe('queryTextError', () => {
  it('rejects empty, too long, multi-line and flag-like queries', () => {
    expect(queryTextError('   ')).toBeTruthy()
    expect(queryTextError('a'.repeat(501))).toBeTruthy()
    expect(queryTextError('a\nb')).toBeTruthy()
    expect(queryTextError('-x')).toBeTruthy()
  })

  it('accepts a normal query', () => {
    expect(queryTextError('type=bug AND updated>1d')).toBeNull()
  })
})
