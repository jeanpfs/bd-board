import { describe, expect, it } from 'vitest'

import { toggleSelection } from './selection'

const order = ['a', 'b', 'c', 'd', 'e']

describe('toggleSelection', () => {
  it('selects a row and makes it the anchor', () => {
    expect(
      toggleSelection([], 'b', { shift: false, order, anchor: undefined }),
    ).toEqual({ selected: ['b'], anchor: 'b' })
  })

  it('deselects a selected row and keeps the others', () => {
    expect(
      toggleSelection(['a', 'b'], 'a', { shift: false, order, anchor: 'a' }),
    ).toEqual({ selected: ['b'], anchor: 'a' })
  })

  it('selects the range from the anchor down to the clicked row', () => {
    expect(
      toggleSelection(['b'], 'd', { shift: true, order, anchor: 'b' }),
    ).toEqual({ selected: ['b', 'c', 'd'], anchor: 'd' })
  })

  it('selects the range from the anchor up to the clicked row', () => {
    expect(
      toggleSelection(['d'], 'b', { shift: true, order, anchor: 'd' }),
    ).toEqual({ selected: ['d', 'b', 'c'], anchor: 'b' })
  })

  it('adds a range to an existing selection without duplicates', () => {
    expect(
      toggleSelection(['a', 'c'], 'e', { shift: true, order, anchor: 'c' }),
    ).toEqual({ selected: ['a', 'c', 'd', 'e'], anchor: 'e' })
  })

  it('treats a shift click as a plain toggle without a usable anchor', () => {
    expect(
      toggleSelection([], 'c', { shift: true, order, anchor: undefined }),
    ).toEqual({ selected: ['c'], anchor: 'c' })
    expect(
      toggleSelection([], 'c', { shift: true, order, anchor: 'gone' }),
    ).toEqual({ selected: ['c'], anchor: 'c' })
  })

  it('treats a shift click on a row outside the visible order as a toggle', () => {
    expect(
      toggleSelection(['a'], 'zz', { shift: true, order, anchor: 'a' }),
    ).toEqual({ selected: ['a', 'zz'], anchor: 'zz' })
  })
})
