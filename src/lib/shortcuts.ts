export type ShortcutGroup = 'Global' | 'Navigate' | 'Bead'

export interface Shortcut {
  id: string
  keys: string[]
  label: string
  group: ShortcutGroup
  sequence?: boolean
}

/** Open dialogs in the document; `bead` counts the bead detail modal among them. */
export interface OpenDialogs {
  total: number
  bead: number
}

/**
 * Single source for the shortcut help dialog and key handling. `Mod K` is
 * listed for the dialog only: the command palette owns that listener.
 */
export const SHORTCUTS: Shortcut[] = [
  {
    id: 'palette',
    keys: ['Mod', 'K'],
    label: 'Command palette',
    group: 'Global',
  },
  { id: 'search', keys: ['/'], label: 'Search this board', group: 'Global' },
  { id: 'new-bead', keys: ['C'], label: 'New bead', group: 'Global' },
  { id: 'shortcuts', keys: ['?'], label: 'Show shortcuts', group: 'Global' },
  { id: 'close', keys: ['Esc'], label: 'Close', group: 'Global' },
  {
    id: 'go-board',
    keys: ['G', 'B'],
    label: 'Board',
    group: 'Navigate',
    sequence: true,
  },
  {
    id: 'go-hierarchy',
    keys: ['G', 'H'],
    label: 'Hierarchy',
    group: 'Navigate',
    sequence: true,
  },
  {
    id: 'go-knowledge',
    keys: ['G', 'K'],
    label: 'Knowledge',
    group: 'Navigate',
    sequence: true,
  },
  {
    id: 'next-card',
    keys: ['J', 'K'],
    label: 'Next / previous card',
    group: 'Navigate',
  },
  {
    id: 'next-column',
    keys: [']', '['],
    label: 'Next / previous column',
    group: 'Navigate',
  },
  { id: 'open-card', keys: ['Enter'], label: 'Open card', group: 'Navigate' },
  { id: 'status', keys: ['S'], label: 'Change status', group: 'Bead' },
  { id: 'priority', keys: ['P'], label: 'Set priority', group: 'Bead' },
  { id: 'assign', keys: ['A'], label: 'Assign', group: 'Bead' },
  { id: 'labels', keys: ['L'], label: 'Labels', group: 'Bead' },
  { id: 'due', keys: ['D'], label: 'Due date', group: 'Bead' },
  { id: 'relation', keys: ['R'], label: 'Add relation', group: 'Bead' },
  { id: 'edit', keys: ['E'], label: 'Edit', group: 'Bead' },
  { id: 'close-bead', keys: ['X'], label: 'Close with reason', group: 'Bead' },
]

export interface KeyboardEventLike {
  key: string
  shiftKey?: boolean
  ctrlKey?: boolean
  metaKey?: boolean
  altKey?: boolean
}

const SINGLE_KEYS: Record<string, string> = {
  '/': 'search',
  c: 'new-bead',
  '?': 'shortcuts',
  j: 'next-card',
  k: 'next-card',
  ']': 'next-column',
  '[': 'next-column',
  s: 'status',
  p: 'priority',
  a: 'assign',
  l: 'labels',
  d: 'due',
  r: 'relation',
  e: 'edit',
  x: 'close-bead',
}

const G_SEQUENCES: Record<string, string> = {
  b: 'go-board',
  h: 'go-hierarchy',
  k: 'go-knowledge',
}

const LETTER_RE = /^[a-z]$/i

/**
 * Resolves one keydown. `G` starts a sequence; the next key completes it or
 * cancels it (an unknown key yields no id and no pending state). Modifier
 * combos and Shift-typed letters are never shortcuts, so `Mod K` falls through.
 */
export function matchShortcut(
  state: { pending?: string },
  event: KeyboardEventLike,
): { id?: string; pending?: string } {
  if (event.ctrlKey || event.metaKey || event.altKey) return {}
  if (event.key.length !== 1) return {}
  if (event.shiftKey && LETTER_RE.test(event.key)) return {}

  const key = event.key.toLowerCase()
  if (state.pending === 'g') {
    const id = G_SEQUENCES[key]
    return id ? { id } : {}
  }
  if (key === 'g') return { pending: 'g' }
  const id = SINGLE_KEYS[key]
  return id ? { id } : {}
}

/**
 * True when a keydown should be left alone: a typing target, or a shortcut
 * blocked by open dialogs. While any dialog is open only Bead shortcuts pass,
 * and only when every open dialog is the bead detail modal.
 */
export function shouldIgnore(
  target: EventTarget | null,
  group: ShortcutGroup,
  dialogs: OpenDialogs,
): boolean {
  if (
    dialogs.total > 0 &&
    !(group === 'Bead' && dialogs.bead === dialogs.total)
  ) {
    return true
  }
  if (!(target instanceof HTMLElement)) return false
  if (target.closest('[contenteditable]:not([contenteditable="false"])')) {
    return true
  }
  return ['INPUT', 'TEXTAREA', 'SELECT'].includes(target.tagName)
}
