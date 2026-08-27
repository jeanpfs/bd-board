import { Link } from '@tanstack/react-router'
import { ArrowUpRight } from 'lucide-react'
import { useQueryClient } from '@tanstack/react-query'
import { getBeads } from '@/lib/server'

import { ProgressRing } from '@/components/progress-ring'

import type { Project } from '@/lib/types'

interface LegendItem {
  key: string
  label: string
  value: number
  dotClassName: string
  textClassName: string
}

const SEGMENT_ORDER: {
  key: 'closed' | 'in_progress' | 'blocked' | 'open'
  className: string
}[] = [
  { key: 'closed', className: 'bg-status-closed' },
  { key: 'in_progress', className: 'bg-status-progress' },
  { key: 'blocked', className: 'bg-status-blocked' },
  { key: 'open', className: 'bg-status-open' },
]

export function ProjectCard({ project }: { project: Project }) {
  const queryClient = useQueryClient()
  const { counts } = project
  const open = counts.open + counts.deferred
  const pctDone = counts.total > 0 ? (counts.closed / counts.total) * 100 : null

  const barCounts = {
    closed: counts.closed,
    in_progress: counts.in_progress,
    blocked: counts.blocked,
    open,
  }

  const legend: LegendItem[] = [
    {
      key: 'closed',
      label: 'Closed',
      value: counts.closed,
      dotClassName: 'bg-status-closed',
      textClassName: 'text-status-closed',
    },
    {
      key: 'in_progress',
      label: 'In Progress',
      value: counts.in_progress,
      dotClassName: 'bg-status-progress',
      textClassName: 'text-status-progress',
    },
    {
      key: 'blocked',
      label: 'Blocked',
      value: counts.blocked,
      dotClassName: 'bg-status-blocked',
      textClassName: 'text-status-blocked',
    },
    {
      key: 'open',
      label: 'Open',
      value: open,
      dotClassName: 'bg-status-open',
      textClassName: 'text-status-open',
    },
  ]

  // Handle error or missing state
  if (project.error || project.missing) {
    return (
      <div className="rounded-[12px] outline-none focus-visible:ring-2 focus-visible:ring-ring/60">
        <div className="flex h-full items-start gap-3 rounded-[12px] bg-card/50 p-4 shadow-card ring-1 ring-inset ring-border/50">
          <div className="flex min-w-0 flex-1 flex-col">
            <h3 className="truncate text-[15px] font-medium tracking-[-0.01em] text-muted-foreground">
              {project.name}
            </h3>
            <p className="mt-[3px] font-mono text-[11px] text-faint">
              {project.error || 'Folder not found'}
            </p>
          </div>
        </div>
      </div>
    )
  }

  return (
    <Link
      to="/p/$project"
      params={{ project: project.id }}
      onMouseEnter={() =>
        queryClient.prefetchQuery({
          queryKey: ['beads', project.id],
          queryFn: () => getBeads({ data: { project: project.id } }),
          staleTime: 3000,
        })
      }
      className="group block rounded-[12px] outline-none focus-visible:ring-2 focus-visible:ring-ring/60"
    >
      <div className="flex h-full items-start gap-3 rounded-[12px] bg-card p-4 shadow-card ring-1 ring-inset ring-border transition-[background-color,box-shadow,transform] duration-[140ms] ease-out group-hover:-translate-y-0.5 group-hover:bg-card-hover group-hover:shadow-[0_8px_22px_-8px_oklch(0_0_0/60%)] group-hover:ring-ring/45">
        <div className="flex min-w-0 flex-1 flex-col">
          <div className="flex items-start gap-3">
            <div className="min-w-0 flex-1">
              <div className="flex items-center gap-1.5">
                <h3 className="truncate text-[15px] font-medium tracking-[-0.01em]">
                  {project.name}
                </h3>
                <ArrowUpRight
                  className="size-3.5 shrink-0 text-transparent transition-colors duration-[140ms] group-hover:text-primary-text"
                  aria-hidden="true"
                />
              </div>
              <p
                className="mt-[3px] font-mono text-[11px] text-faint truncate"
                title={project.beadsPath}
              >
                {project.beadsPath}
              </p>
            </div>

            <ProgressRing value={pctDone} />
          </div>

          {counts.total > 0 ? (
            <span className="mt-3.5 flex h-[5px] w-full overflow-hidden rounded-full bg-white/7">
              {SEGMENT_ORDER.filter((s) => barCounts[s.key] > 0).map((s) => (
                <span
                  key={s.key}
                  className={s.className}
                  style={{
                    width: `${(barCounts[s.key] / counts.total) * 100}%`,
                  }}
                />
              ))}
            </span>
          ) : null}

          <div className="mt-3.5 grid grid-cols-2 gap-x-3.5 gap-y-1.5">
            {legend.map((item) => (
              <span
                key={item.key}
                className="inline-flex items-center gap-1.5 text-xs text-muted-foreground"
              >
                <span
                  className={`size-1.5 shrink-0 rounded-full ${item.dotClassName}`}
                  aria-hidden="true"
                />
                <span
                  className={`font-mono font-medium tabular-nums ${item.textClassName}`}
                >
                  {item.value}
                </span>
                <span className="truncate">{item.label}</span>
              </span>
            ))}
          </div>
        </div>
      </div>
    </Link>
  )
}
