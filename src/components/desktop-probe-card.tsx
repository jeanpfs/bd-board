import { useEffect, useState } from 'react'
import { LaptopMinimal, RefreshCw, Terminal } from 'lucide-react'

import { loadDesktopProbe } from '@/lib/desktop'
import type { DesktopProbe } from '@/lib/desktop'
import { Button } from '@/components/ui/button'
import { Card } from '@/components/ui/card'
import { Skeleton } from '@/components/ui/skeleton'

type ProbeState =
  | { kind: 'hidden' }
  | { kind: 'loading' }
  | { kind: 'ready'; probe: DesktopProbe }
  | { kind: 'error'; message: string }

export function DesktopProbeCard() {
  const [state, setState] = useState<ProbeState>({ kind: 'hidden' })

  useEffect(() => {
    let active = true

    async function run() {
      if (typeof window === 'undefined') return
      if (typeof window.isTauri !== 'function' || !window.isTauri()) return

      setState({ kind: 'loading' })

      try {
        const probe = await loadDesktopProbe()
        if (!active || !probe) return
        setState({ kind: 'ready', probe })
      } catch (error) {
        if (!active) return
        setState({
          kind: 'error',
          message: error instanceof Error ? error.message : String(error),
        })
      }
    }

    void run()

    return () => {
      active = false
    }
  }, [])

  if (state.kind === 'hidden') return null

  return (
    <Card className="gap-3 p-4">
      <div className="flex items-start gap-3">
        <span className="flex size-9 shrink-0 items-center justify-center rounded-lg bg-primary/10 text-primary ring-1 ring-inset ring-primary/20">
          <LaptopMinimal className="size-4" aria-hidden="true" />
        </span>
        <div className="min-w-0 flex-1">
          <div className="flex items-center gap-2">
            <p className="text-sm font-medium">Desktop shell</p>
            <span className="inline-flex items-center gap-1 rounded-full bg-muted px-2 py-0.5 text-[11px] font-medium text-muted-foreground">
              <Terminal className="size-3" aria-hidden="true" />
              Tauri
            </span>
          </div>
          <p className="text-xs text-muted-foreground">
            The app is running inside the desktop shell and can call the local
            `bd` binary.
          </p>
        </div>
      </div>

      {state.kind === 'loading' ? (
        <div className="grid gap-2 sm:grid-cols-2">
          <Skeleton className="h-16 w-full" />
          <Skeleton className="h-16 w-full" />
        </div>
      ) : state.kind === 'error' ? (
        <div className="flex flex-col gap-3 rounded-lg border border-destructive/30 bg-destructive/5 p-3">
          <p className="text-xs text-destructive">{state.message}</p>
          <Button
            variant="outline"
            size="sm"
            className="w-fit gap-2"
            onClick={() => setState({ kind: 'hidden' })}
          >
            <RefreshCw className="size-3.5" aria-hidden="true" />
            Dismiss
          </Button>
        </div>
      ) : (
        <div className="grid gap-2 sm:grid-cols-2">
          <div className="rounded-lg bg-muted/40 p-3">
            <p className="text-[11px] uppercase tracking-wide text-muted-foreground">
              bd binary
            </p>
            <p className="mt-1 break-all text-sm font-medium">
              {state.probe.bdBinary}
            </p>
            <p className="mt-1 text-xs text-muted-foreground">
              {state.probe.bdVersion}
            </p>
          </div>
          <div className="rounded-lg bg-muted/40 p-3">
            <p className="text-[11px] uppercase tracking-wide text-muted-foreground">
              Project roots
            </p>
            <p className="mt-1 text-sm font-medium">
              {state.probe.projectRoots.length}
            </p>
            <p className="mt-1 line-clamp-2 text-xs text-muted-foreground">
              {state.probe.rootStatuses
                .map((root) => `${root.exists ? '✓' : '×'} ${root.path}`)
                .join(' · ')}
            </p>
          </div>
        </div>
      )}
    </Card>
  )
}
