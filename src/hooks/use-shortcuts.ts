import { useEffect, useRef } from 'react'

import { SHORTCUTS, matchShortcut, shouldIgnore } from '@/lib/shortcuts'

import type { OpenDialogs } from '@/lib/shortcuts'

export interface ShortcutHandlers {
  navigateTab: (tab: 'board' | 'hierarchy' | 'knowledge') => void
  newBead: () => void
  showShortcuts: () => void
  focusSearch: () => void
  moveCard: (direction: 'next' | 'prev') => void
  moveColumn: (direction: 'next' | 'prev') => void
  beadAction: (id: string) => void
  /** Claims the focused Ready row; returns false when none has focus. */
  claimFocused?: () => boolean
  /** Toggles the focused list row; returns false when none has focus. */
  toggleFocusedRow?: () => boolean
}

const TAB_BY_ID: Partial<Record<string, 'board' | 'hierarchy' | 'knowledge'>> =
  {
    'go-board': 'board',
    'go-hierarchy': 'hierarchy',
    'go-knowledge': 'knowledge',
  }

const BEAD_ACTION_IDS: Partial<Record<string, true>> = {
  status: true,
  priority: true,
  assign: true,
  labels: true,
  due: true,
  relation: true,
  edit: true,
  'close-bead': true,
}

const PENDING_MS = 1000

function openDialogs(): OpenDialogs {
  return {
    total: document.querySelectorAll('[role="dialog"][data-state="open"]')
      .length,
    bead: document.querySelectorAll(
      '[role="dialog"][data-state="open"][data-bead-detail]',
    ).length,
  }
}

export function useShortcuts(handlers: ShortcutHandlers) {
  const ref = useRef(handlers)
  useEffect(() => {
    ref.current = handlers
  })

  useEffect(() => {
    let pending: string | undefined
    let timer: number | undefined

    function clearPending() {
      pending = undefined
      window.clearTimeout(timer)
      timer = undefined
    }

    function onKeyDown(event: KeyboardEvent) {
      const result = matchShortcut({ pending }, event)
      const shortcut = result.id
        ? SHORTCUTS.find((s) => s.id === result.id)
        : undefined
      // A G press starts a sequence; its group is only known on the next key.
      const group = shortcut?.group ?? 'Global'
      if (shouldIgnore(event.target, group, openDialogs())) {
        clearPending()
        return
      }

      if (result.pending) {
        clearPending()
        pending = result.pending
        timer = window.setTimeout(clearPending, PENDING_MS)
        return
      }
      clearPending()
      if (!shortcut) return

      const h = ref.current
      const id = shortcut.id
      const tab = TAB_BY_ID[id]
      if (tab) {
        event.preventDefault()
        h.navigateTab(tab)
        return
      }
      switch (id) {
        case 'new-bead':
          if (h.claimFocused?.()) {
            event.preventDefault()
            return
          }
          event.preventDefault()
          h.newBead()
          return
        case 'shortcuts':
          event.preventDefault()
          h.showShortcuts()
          return
        case 'search':
          event.preventDefault()
          h.focusSearch()
          return
        case 'next-card':
          event.preventDefault()
          h.moveCard(event.key === 'K' || event.key === 'k' ? 'prev' : 'next')
          return
        case 'next-column':
          event.preventDefault()
          h.moveColumn(event.key === '[' ? 'prev' : 'next')
          return
        default:
          if (id === 'close-bead' && h.toggleFocusedRow?.()) {
            event.preventDefault()
            return
          }
          if (BEAD_ACTION_IDS[id]) {
            event.preventDefault()
            h.beadAction(id)
          }
      }
    }

    window.addEventListener('keydown', onKeyDown)
    return () => {
      window.removeEventListener('keydown', onKeyDown)
      clearPending()
    }
  }, [])
}
