import { Fragment, useState, useSyncExternalStore } from 'react'

import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog'
import { Kbd, KbdGroup } from '@/components/ui/kbd'
import { SHORTCUTS } from '@/lib/shortcuts'
import { isMacPlatform } from '@/lib/platform'

import type { Shortcut, ShortcutGroup } from '@/lib/shortcuts'

const GROUPS: ShortcutGroup[] = ['Global', 'Navigate', 'Bead']

let shortcutsOpen = false
const listeners = new Set<() => void>()

function setShortcutsOpen(next: boolean) {
  if (shortcutsOpen === next) return
  shortcutsOpen = next
  for (const listener of listeners) listener()
}

function subscribe(listener: () => void) {
  listeners.add(listener)
  return () => {
    listeners.delete(listener)
  }
}

/** Opens the help dialog from anywhere: the palette hint, the board hook. */
export function openShortcutsDialog() {
  setShortcutsOpen(true)
}

function ShortcutRow({ shortcut, mac }: { shortcut: Shortcut; mac: boolean }) {
  return (
    <li className="flex items-center justify-between gap-3 py-1.5">
      <span className="text-body text-foreground">{shortcut.label}</span>
      <KbdGroup>
        {shortcut.keys.map((key, i) => (
          <Fragment key={`${i}-${key}`}>
            {shortcut.sequence && i === 1 ? (
              <span className="text-xs text-muted-foreground">then</span>
            ) : null}
            <Kbd>{key === 'Mod' ? (mac ? 'Cmd' : 'Ctrl') : key}</Kbd>
          </Fragment>
        ))}
      </KbdGroup>
    </li>
  )
}

export function ShortcutsDialog() {
  const open = useSyncExternalStore(
    subscribe,
    () => shortcutsOpen,
    () => false,
  )
  const [mac] = useState(isMacPlatform)

  return (
    <Dialog open={open} onOpenChange={setShortcutsOpen}>
      <DialogContent className="sm:max-w-[880px]">
        <DialogHeader>
          <DialogTitle className="text-title">Keyboard shortcuts</DialogTitle>
          <DialogDescription className="text-body">
            Shortcuts act on the focused card or the open bead.
          </DialogDescription>
        </DialogHeader>

        <div className="grid grid-cols-1 gap-6 sm:grid-cols-3">
          {GROUPS.map((group) => {
            const rows = SHORTCUTS.filter((s) => s.group === group)
            return (
              <section key={group} aria-label={group}>
                <h3 className="mb-2 flex items-baseline gap-2 text-sm font-semibold text-foreground">
                  {group}
                  <span className="text-xs font-normal text-muted-foreground">
                    {rows.length}
                  </span>
                </h3>
                <ul className="flex flex-col">
                  {rows.map((shortcut) => (
                    <ShortcutRow
                      key={shortcut.id}
                      shortcut={shortcut}
                      mac={mac}
                    />
                  ))}
                </ul>
              </section>
            )
          })}
        </div>

        <p className="text-xs text-muted-foreground">
          Delete is not a shortcut. Remove a bead from its modal, with
          confirmation.
        </p>
      </DialogContent>
    </Dialog>
  )
}
