import { Link } from '@tanstack/react-router'
import { ArrowUpRight } from 'lucide-react'

import { ProgressRing } from '@/components/progress-ring'

import type { Project } from '@/lib/types'

interface LegendItem {
  key: string
  label: string
  value: number
  dotClassName: string
  textClassName: string
}

export function ProjectCard({ project }: { project: Project }) {
  const { counts } = project
  const aberto = counts.open + counts.deferred
  const pctDone = counts.total > 0 ? (counts.closed / counts.total) * 100 : null

  const legend: LegendItem[] = [
    {
      key: 'open',
      label: 'Aberto',
      value: aberto,
      dotClassName: 'bg-status-open',
      textClassName: 'text-status-open',
    },
    {
      key: 'in_progress',
      label: 'Em progresso',
      value: counts.in_progress,
      dotClassName: 'bg-status-progress',
      textClassName: 'text-status-progress',
    },
    {
      key: 'blocked',
      label: 'Bloqueado',
      value: counts.blocked,
      dotClassName: 'bg-status-blocked',
      textClassName: 'text-status-blocked',
    },
    {
      key: 'closed',
      label: 'Fechado',
      value: counts.closed,
      dotClassName: 'bg-status-closed',
      textClassName: 'text-status-closed',
    },
  ]

  return (
    <Link
      to="/p/$project"
      params={{ project: project.database }}
      className="group block rounded-xl outline-none focus-visible:ring-2 focus-visible:ring-ring/60"
    >
      <div className="flex h-full items-start gap-4 rounded-xl bg-card p-4 ring-1 ring-foreground/10 transition-all duration-200 group-hover:-translate-y-0.5 group-hover:bg-accent/30 group-hover:ring-primary/40">
        <div className="flex min-w-0 flex-1 flex-col gap-4">
          <div className="min-w-0">
            <div className="flex items-center gap-1.5">
              <h3 className="truncate text-base font-medium tracking-tight">
                {project.name}
              </h3>
              <ArrowUpRight
                className="size-3.5 shrink-0 text-muted-foreground/0 transition-colors duration-200 group-hover:text-muted-foreground/70"
                aria-hidden="true"
              />
            </div>
            <p className="mt-1 text-xs text-muted-foreground">
              <span className="font-mono">{project.database}</span>
              <span className="px-1 text-muted-foreground/40">·</span>
              {counts.total.toLocaleString('pt-BR')} beads
            </p>
          </div>

          <div className="grid grid-cols-2 gap-x-4 gap-y-2">
            {legend.map((item) => (
              <span
                key={item.key}
                className="inline-flex items-center gap-1.5 text-xs"
              >
                <span
                  className={`size-1.5 shrink-0 rounded-full ${item.dotClassName}`}
                  aria-hidden="true"
                />
                <span
                  className={`font-medium tabular-nums ${item.textClassName}`}
                >
                  {item.value}
                </span>
                <span className="truncate text-muted-foreground/70">
                  {item.label}
                </span>
              </span>
            ))}
          </div>
        </div>

        <ProgressRing value={pctDone} />
      </div>
    </Link>
  )
}
