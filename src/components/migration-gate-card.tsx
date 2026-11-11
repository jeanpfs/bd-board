import { Copy, DatabaseZap, ExternalLink } from 'lucide-react'
import { toast } from 'sonner'

import { Button } from '@/components/ui/button'
import type { MigrationGate } from '@/lib/migration-gate'

function copy(text: string) {
  navigator.clipboard
    .writeText(text)
    .then(() => toast.success('Command copied'))
    .catch(() => toast.error('Could not copy to clipboard'))
}

/**
 * bd refuses to migrate a shared database on its own (#4259): exactly one
 * clone migrates, the others adopt. bd board only lays out bd's options; the
 * person picks one and runs it in the project folder.
 */
export function MigrationGateCard({
  gate,
  detail,
  onRetry,
}: {
  gate: MigrationGate
  /** bd's own failure, when the gate also broke the request. */
  detail?: string
  onRetry?: () => void
}) {
  return (
    <section className="flex w-full max-w-2xl flex-col gap-4 rounded-xl bg-card p-5 ring-1 ring-inset ring-warn/35">
      <header className="flex items-start gap-3">
        <DatabaseZap
          className="mt-0.5 size-5 shrink-0 text-warn"
          aria-hidden="true"
        />
        <div className="min-w-0 flex-1">
          <h2 className="text-sm font-medium">
            Schema migration needs a decision
          </h2>
          <p className="mt-1 text-sm text-muted-foreground">
            This database is on schema v{gate.currentVersion}; bd expects v
            {gate.latestVersion} ({gate.pending} pending). It is shared with
            other clones, so bd will not migrate it by itself. Reads may work;
            writes are blocked until one clone migrates.
          </p>
          {detail ? (
            <p className="mt-2 font-mono text-badge text-faint">{detail}</p>
          ) : null}
        </div>
      </header>

      {gate.options.length > 0 ? (
        <ol className="flex flex-col gap-2.5">
          {gate.options.map((option) => {
            const command = option.commands.join(' && ')
            return (
              <li
                key={option.id ?? option.label}
                className="rounded-lg bg-canvas p-3 ring-1 ring-inset ring-border"
              >
                <p className="text-sm font-medium">{option.label}</p>
                {option.when ? (
                  <p className="mt-0.5 text-xs text-muted-foreground">
                    When {option.when}.
                  </p>
                ) : null}
                <div className="mt-2 flex items-center gap-2 rounded-md bg-background px-2.5 py-1.5 ring-1 ring-inset ring-border">
                  <code className="min-w-0 flex-1 truncate font-mono text-xs">
                    {command}
                  </code>
                  <Button
                    size="icon-xs"
                    variant="ghost"
                    aria-label={`Copy: ${command}`}
                    onClick={() => copy(command)}
                  >
                    <Copy className="size-3" aria-hidden="true" />
                  </Button>
                </div>
                {option.risk ? (
                  <p className="mt-2 text-xs text-warn">Risk: {option.risk}.</p>
                ) : null}
              </li>
            )
          })}
        </ol>
      ) : null}

      <footer className="flex flex-wrap items-center gap-3 text-xs text-muted-foreground">
        <span className="min-w-0 flex-1">
          bd board never runs these. Run one in the project folder, then retry.
        </span>
        {gate.docs ? (
          <a
            href={gate.docs}
            target="_blank"
            rel="noreferrer"
            className="inline-flex items-center gap-1 text-primary-text hover:underline"
          >
            Upgrade guide
            <ExternalLink className="size-3" aria-hidden="true" />
          </a>
        ) : null}
        {onRetry ? (
          <Button size="sm" variant="outline" onClick={onRetry}>
            Try again
          </Button>
        ) : null}
      </footer>
    </section>
  )
}
