import { describe, expect, it } from 'vitest'

import { branchName, matchRange, searchBeads } from './command-search'

import type { Bead, Project } from './types'

function project(id: string): Project {
  return {
    id,
    name: id,
    dir: `/tmp/${id}`,
    beadsPath: `/tmp/${id}/.beads`,
    prefix: id,
    external: false,
    missing: false,
    error: null,
    migration: null,
    counts: {
      open: 0,
      in_progress: 0,
      blocked: 0,
      closed: 0,
      deferred: 0,
      total: 0,
    },
  }
}

function item(
  id: string,
  title: string,
  opts: { status?: string; project?: string } = {},
  index = 0,
) {
  const bead: Bead = {
    id,
    title,
    status: opts.status ?? 'open',
    priority: 2,
    issue_type: 'task',
  }
  return { bead, project: project(opts.project ?? 'a'), index }
}

function ids(results: { bead: Bead }[]) {
  return results.map((r) => r.bead.id)
}

describe('searchBeads', () => {
  it('ranks exact id, then id prefix, then title word prefix, then substring', () => {
    const items = [
      item('y-2', 'Prefix-x-1 thing', {}, 0), // substring only
      item('y-1', 'Fix x-1 handling', {}, 1), // title word prefix
      item('x-10', 'Ten', {}, 2), // id prefix
      item('x-1', 'Something else', {}, 3), // exact id
    ]
    expect(ids(searchBeads('x-1', items))).toEqual([
      'x-1',
      'x-10',
      'y-1',
      'y-2',
    ])
  })

  it('matches title word prefixes before plain substrings', () => {
    const items = [
      item('a-1', 'Unlogin handling', {}, 0),
      item('a-2', 'Login page', {}, 1),
    ]
    expect(ids(searchBeads('log', items))).toEqual(['a-2', 'a-1'])
  })

  it('is case-insensitive and ignores surrounding whitespace', () => {
    const items = [item('a-1', 'Login page')]
    expect(ids(searchBeads('  LOGIN ', items))).toEqual(['a-1'])
  })

  it('drops beads that do not match', () => {
    const items = [item('a-1', 'Login page'), item('a-2', 'Billing')]
    expect(ids(searchBeads('login', items))).toEqual(['a-1'])
  })

  it('prefers the scoped project when ranks tie', () => {
    const items = [
      item('b-1', 'Login page', { project: 'b' }, 0),
      item('a-1', 'Login page', { project: 'a' }, 1),
    ]
    expect(ids(searchBeads('login', items, 'a'))).toEqual(['a-1', 'b-1'])
    expect(ids(searchBeads('login', items))).toEqual(['b-1', 'a-1'])
  })

  it('lets the scoped project beat a better rank', () => {
    const items = [
      item('a-5', 'About b-7 mention', { project: 'a' }, 0), // word prefix
      item('b-7', 'Other', { project: 'b' }, 1), // exact id
    ]
    expect(ids(searchBeads('b-7', items, 'a'))).toEqual(['a-5', 'b-7'])
    expect(ids(searchBeads('b-7', items))).toEqual(['b-7', 'a-5'])
  })

  it('puts a closed scoped bead after an open unscoped one', () => {
    const items = [
      item('a-1', 'Login', { project: 'a', status: 'closed' }, 0),
      item('b-1', 'Login page', { project: 'b' }, 1),
    ]
    expect(ids(searchBeads('login', items, 'a'))).toEqual(['b-1', 'a-1'])
  })

  it('puts closed beads last, even when they rank better', () => {
    const items = [
      item('a-1', 'Login', { status: 'closed' }, 0),
      item('a-2', 'Old login page', {}, 1),
    ]
    expect(ids(searchBeads('login', items))).toEqual(['a-2', 'a-1'])
  })

  it('keeps input order for equal matches and honors the limit', () => {
    const items = Array.from({ length: 10 }, (_, i) =>
      item(`a-${i}`, 'Login page', {}, i),
    )
    expect(ids(searchBeads('login', items))).toEqual([
      'a-0',
      'a-1',
      'a-2',
      'a-3',
      'a-4',
      'a-5',
    ])
    expect(searchBeads('login', items, undefined, 2)).toHaveLength(2)
  })

  it('with an empty query lists beads scoped first, closed last', () => {
    const items = [
      item('b-1', 'B', { project: 'b' }, 0),
      item('a-1', 'A closed', { project: 'a', status: 'closed' }, 1),
      item('a-2', 'A', { project: 'a' }, 2),
    ]
    expect(ids(searchBeads('', items, 'a'))).toEqual(['a-2', 'b-1', 'a-1'])
  })
})

describe('matchRange', () => {
  it('prefers a word prefix over an earlier-in-text substring', () => {
    expect(matchRange('Unlogin Login', 'log')).toEqual([8, 11])
  })

  it('falls back to a substring and is case-insensitive', () => {
    expect(matchRange('Unlogin', 'LOG')).toEqual([2, 5])
  })

  it('returns null without a match or with an empty query', () => {
    expect(matchRange('Billing', 'zzz')).toBeNull()
    expect(matchRange('Billing', '  ')).toBeNull()
  })
})

describe('branchName', () => {
  it('joins the lowercased id and slugified title', () => {
    expect(branchName({ id: 'BD-12', title: 'Fix the Login page!' })).toBe(
      'bd-12-fix-the-login-page',
    )
  })

  it('strips accents and drops non-ascii characters', () => {
    expect(branchName({ id: 'a-1', title: 'Café ☕ crème 日本' })).toBe(
      'a-1-cafe-creme',
    )
  })

  it('caps the slug at 48 chars without a trailing hyphen', () => {
    // The 48th char falls on the separator; it must not survive as a hyphen.
    const name = branchName({ id: 'a-1', title: `${'a'.repeat(47)} bb` })
    expect(name).toBe(`a-1-${'a'.repeat(47)}`)
  })

  it('caps long slugs at 48 chars', () => {
    const name = branchName({ id: 'a-1', title: 'word '.repeat(20) })
    expect(name.slice('a-1-'.length).length).toBe(48)
  })

  it('falls back to the id when the title has no usable characters', () => {
    expect(branchName({ id: 'A-1', title: '日本語 ☕' })).toBe('a-1')
  })
})
