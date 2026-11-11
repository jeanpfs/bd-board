import { useEffect, useRef } from 'react'

import { SHORTCUTS, matchShortcut, shouldIgnore } from '@/lib/shortcuts'

export interface ShortcutHandlers {
  navigateTab: (tab: 'board' | 'hierarchy' | 'knowledge') => void
  newBead: () => void
  showShortcuts: () => void
  focusSearch: () => void
  moveCard: (direction: 'next' | 'prev') => void
  moveColumn: (direction: 'next' | 'prev') => void
  beadAction: (id: string) => void
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

// A dialog other than the bead detail modal blocks non-global shortcuts.
function hasBlockingDialog(): boolean {
  return (
    document.querySelector(
      '[role="dialog"][data-state="open"]:not([data-bead-detail])',
    ) !== null
  )
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
      if (shouldIgnore(event.target, false)) {
        clearPending()
        return
      }

      const result = matchShortcut({ pending }, event)
      if (result.pending) {
        clearPending()
        pending = result.pending
        timer = window.setTimeout(clearPending, PENDING_MS)
        return
      }
      clearPending()
      if (!result.id) return

      const shortcut = SHORTCUTS.find((s) => s.id === result.id)
      if (!shortcut) return
      if (shortcut.group !== 'Global' && hasBlockingDialog()) return

      const h = ref.current
      const id = result.id
      const tab = TAB_BY_ID[id]
      if (tab) {
        event.preventDefault()
        h.navigateTab(tab)
        return
      }
      switch (id) {
        case 'new-bead':
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
          h.moveCard('next')
          return
        case 'prev-card':
          event.preventDefault()
          h.moveCard('prev')
          return
        case 'next-column':
          event.preventDefault()
          h.moveColumn('next')
          return
        case 'prev-column':
          event.preventDefault()
          h.moveColumn('prev')
          return
        default:
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
