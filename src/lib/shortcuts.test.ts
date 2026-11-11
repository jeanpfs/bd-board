// @vitest-environment jsdom
import { describe, expect, it } from 'vitest'

import { SHORTCUTS, matchShortcut, shouldIgnore } from './shortcuts'

function key(k: string, extra: Record<string, boolean> = {}) {
  return { key: k, ...extra }
}

describe('matchShortcut', () => {
  it('maps single keys to shortcut ids', () => {
    expect(matchShortcut({}, key('c')).id).toBe('new-bead')
    expect(matchShortcut({}, key('s')).id).toBe('status')
    expect(matchShortcut({}, key('x')).id).toBe('close-bead')
    expect(matchShortcut({}, key('/')).id).toBe('search')
    expect(matchShortcut({}, key(']')).id).toBe('next-column')
    expect(matchShortcut({}, key('[')).id).toBe('prev-column')
  })

  it('treats Caps Lock letters like lowercase ones', () => {
    expect(matchShortcut({}, key('J')).id).toBe('next-card')
  })

  it('matches ? only with the key it produces, shift included', () => {
    expect(matchShortcut({}, key('?', { shiftKey: true })).id).toBe('shortcuts')
  })

  it('G then B goes to the board', () => {
    const first = matchShortcut({}, key('g'))
    expect(first).toEqual({ pending: 'g' })
    expect(matchShortcut(first, key('b'))).toEqual({ id: 'go-board' })
    expect(matchShortcut(first, key('h'))).toEqual({ id: 'go-hierarchy' })
    expect(matchShortcut(first, key('k'))).toEqual({ id: 'go-knowledge' })
  })

  it('G then an unknown key does nothing and clears the sequence', () => {
    expect(matchShortcut({ pending: 'g' }, key('z'))).toEqual({})
    // `j` after a stale `g` is not next-card: the sequence consumed it.
    expect(matchShortcut({ pending: 'g' }, key('j'))).toEqual({})
  })

  it('ignores letter shortcuts typed with Shift', () => {
    expect(matchShortcut({}, key('J', { shiftKey: true }))).toEqual({})
    expect(matchShortcut({}, key('G', { shiftKey: true }))).toEqual({})
    expect(
      matchShortcut({ pending: 'g' }, key('B', { shiftKey: true })),
    ).toEqual({})
  })

  it('ignores combinations with Ctrl, Cmd or Alt', () => {
    expect(matchShortcut({}, key('c', { ctrlKey: true }))).toEqual({})
    expect(matchShortcut({}, key('c', { metaKey: true }))).toEqual({})
    expect(matchShortcut({}, key('c', { altKey: true }))).toEqual({})
    expect(
      matchShortcut({ pending: 'g' }, key('b', { metaKey: true })),
    ).toEqual({})
  })

  it('does not claim Mod K (the command palette owns it)', () => {
    expect(matchShortcut({}, key('k', { metaKey: true }))).toEqual({})
    expect(matchShortcut({}, key('k', { ctrlKey: true }))).toEqual({})
  })

  it('returns nothing for unbound keys', () => {
    expect(matchShortcut({}, key('q'))).toEqual({})
    expect(matchShortcut({}, key('Enter'))).toEqual({})
  })
})

describe('shouldIgnore', () => {
  it('ignores typing targets', () => {
    expect(shouldIgnore(document.createElement('input'), false)).toBe(true)
    expect(shouldIgnore(document.createElement('textarea'), false)).toBe(true)
    expect(shouldIgnore(document.createElement('select'), false)).toBe(true)
  })

  it('ignores contenteditable targets', () => {
    const div = document.createElement('div')
    div.setAttribute('contenteditable', 'true')
    expect(shouldIgnore(div, false)).toBe(true)
    const child = document.createElement('span')
    div.appendChild(child)
    expect(shouldIgnore(child, false)).toBe(true)
  })

  it('lets plain targets through unless a dialog is open', () => {
    expect(shouldIgnore(document.createElement('div'), false)).toBe(false)
    expect(shouldIgnore(document.body, false)).toBe(false)
    expect(shouldIgnore(null, false)).toBe(false)
    expect(shouldIgnore(document.createElement('div'), true)).toBe(true)
  })
})

describe('SHORTCUTS', () => {
  it('has unique ids', () => {
    const ids = SHORTCUTS.map((s) => s.id)
    expect(new Set(ids).size).toBe(ids.length)
  })

  it('has unique key combos', () => {
    const combos = SHORTCUTS.map((s) => s.keys.join(' '))
    expect(new Set(combos).size).toBe(combos.length)
  })

  it('every matchable single-key shortcut resolves to its own id', () => {
    for (const s of SHORTCUTS) {
      if (s.keys.length !== 1 || s.keys[0].length !== 1) continue
      const k = s.keys[0]
      const result = matchShortcut({}, key(k, { shiftKey: k === '?' }))
      expect(result.id ?? result.pending).toBeDefined()
      if (result.id) expect(result.id).toBe(s.id)
    }
  })

  it('every G sequence resolves to its own id', () => {
    for (const s of SHORTCUTS) {
      if (s.keys.length !== 2 || s.keys[0] !== 'G') continue
      expect(
        matchShortcut({ pending: 'g' }, key(s.keys[1].toLowerCase())).id,
      ).toBe(s.id)
    }
  })

  it('lists the documented groups', () => {
    expect(new Set(SHORTCUTS.map((s) => s.group))).toEqual(
      new Set(['Global', 'Navigate', 'Bead']),
    )
  })
})
