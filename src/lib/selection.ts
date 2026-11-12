export interface SelectionStep {
  /** Shift was held: select the range from the anchor to `id`. */
  shift: boolean
  /** Visible row ids, top to bottom. */
  order: string[]
  anchor?: string
}

export interface SelectionResult {
  selected: string[]
  anchor: string
}

/**
 * Row selection for the list view. A plain click toggles one row; a shift
 * click adds the rows between the anchor and `id` (inclusive) to the selection.
 * A shift click with no usable anchor falls back to a plain toggle.
 */
export function toggleSelection(
  selected: string[],
  id: string,
  step: SelectionStep,
): SelectionResult {
  const { order, anchor } = step
  const from = anchor === undefined ? -1 : order.indexOf(anchor)
  const to = order.indexOf(id)

  if (step.shift && from !== -1 && to !== -1) {
    const [lo, hi] = from <= to ? [from, to] : [to, from]
    const range = order.slice(lo, hi + 1)
    const extra = range.filter((rowId) => !selected.includes(rowId))
    return { selected: [...selected, ...extra], anchor: id }
  }

  const next = selected.includes(id)
    ? selected.filter((rowId) => rowId !== id)
    : [...selected, id]
  return { selected: next, anchor: id }
}
