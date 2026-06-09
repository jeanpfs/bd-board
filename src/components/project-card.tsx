import { Link } from '@tanstack/react-router'
import { ArrowUpRight } from 'lucide-react'

import {
  Card,
  CardContent,
  CardHeader,
  CardTitle,
} from '@/components/ui/card'
import { StatusMiniBar } from '@/components/status-mini-bar'

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

  const isEmpty = counts.total === 0

  return (
    <Link
      to="/p/$project"
      params={{ project: project.database }}
      className="group block rounded-xl outline-none focus-visible:ring-2 focus-visible:ring-ring/60"
    >
      <Card className="h-full gap-3 transition-colors duration-200 group-hover:bg-accent/40 group-hover:ring-primary/40">
        <CardHeader className="grid-cols-[1fr_auto] items-center gap-2">
          <div className="flex min-w-0 items-center gap-1.5">
            <CardTitle className="truncate text-base font-medium tracking-tight">
              {project.name}
            </CardTitle>
            <ArrowUpRight
              className="size-3.5 shrink-0 text-muted-foreground/0 transition-colors duration-200 group-hover:text-muted-foreground/70"
              aria-hidden="true"
            />
          </div>
          <span className="shrink-0 rounded-md bg-muted px-1.5 py-0.5 font-mono text-[0.7rem] leading-none text-muted-foreground">
            {project.database}
          </span>
        </CardHeader>

        <CardContent className="flex flex-col gap-3">
          {isEmpty ? (
            <div className="flex h-2 items-center">
              <span className="text-xs text-muted-foreground/70">vazio</span>
            </div>
          ) : (
            <StatusMiniBar counts={counts} />
          )}

          <div className="flex flex-wrap items-center gap-x-3 gap-y-1.5 text-xs text-muted-foreground">
            {legend.map((item) => (
              <span key={item.key} className="inline-flex items-center gap-1.5">
                <span
                  className={`size-1.5 shrink-0 rounded-full ${item.dotClassName}`}
                  aria-hidden="true"
                />
                <span className="text-muted-foreground/80">{item.label}</span>
                <span className={`tabular-nums ${item.textClassName}`}>
                  {item.value}
                </span>
              </span>
            ))}
          </div>
        </CardContent>
      </Card>
    </Link>
  )
}
