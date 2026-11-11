import { useState } from 'react'

import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog'
import { Kbd, KbdGroup } from '@/components/ui/kbd'
import { SHORTCUTS } from '@/lib/shortcuts'

import type { Shortcut, ShortcutGroup } from '@/lib/shortcuts'

const GROUPS: ShortcutGroup[] = ['Global', 'Navigate', 'Bead']

function ShortcutRow({ shortcut, mac }: { shortcut: Shortcut; mac: boolean }) {
  return (
    <li className="flex items-center justify-between gap-3 py-1.5">
      <span className="text-body text-foreground">{shortcut.label}</span>
      <KbdGroup>
        {shortcut.keys.map((key) => (
          <Kbd key={key}>{key === 'Mod' ? (mac ? 'Cmd' : 'Ctrl') : key}</Kbd>
        ))}
      </KbdGroup>
    </li>
  )
}

export function ShortcutsDialog({
  open,
  onOpenChange,
}: {
  open: boolean
  onOpenChange: (open: boolean) => void
}) {
  const [mac] = useState(() => /mac|iphone|ipad/i.test(navigator.platform))

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-[880px]">
        <DialogHeader>
          <DialogTitle className="text-title">Keyboard shortcuts</DialogTitle>
          <DialogDescription className="text-body">
            Shortcuts act on the focused card or the open bead.
          </DialogDescription>
        </DialogHeader>

        <div className="grid grid-cols-1 gap-6 sm:grid-cols-3">
          {GROUPS.map((group) => (
            <section key={group} aria-label={group}>
              <h3 className="mb-2 text-sm font-semibold text-foreground">
                {group}
              </h3>
              <ul className="flex flex-col">
                {SHORTCUTS.filter((s) => s.group === group).map((shortcut) => (
                  <ShortcutRow
                    key={shortcut.id}
                    shortcut={shortcut}
                    mac={mac}
                  />
                ))}
              </ul>
            </section>
          ))}
        </div>

        <p className="text-xs text-muted-foreground">
          Delete is not a shortcut. Remove a bead from its modal, with
          confirmation.
        </p>
      </DialogContent>
    </Dialog>
  )
}
