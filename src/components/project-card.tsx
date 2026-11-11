import { useState } from 'react'
import { Link } from '@tanstack/react-router'
import { ArrowRight } from 'lucide-react'

import { ConfirmDeleteModal } from '@/components/confirm-delete-modal'
import { EditProjectModal } from '@/components/edit-project-modal'
import { SIGNAL_ICON } from '@/components/home-sections'
import { ProjectActionsMenu } from '@/components/project-actions-menu'
import { ProjectChip } from '@/components/project-chip'
import {
  HoverCard,
  HoverCardContent,
  HoverCardTrigger,
} from '@/components/ui/hover-card'
import { lastActivity, projectHeadline, projectProblem } from '@/lib/attention'
import { isReady } from '@/lib/sort'
import { relativeDate } from '@/lib/time'
import { cn } from '@/lib/utils'

import type { Bead, Project } from '@/lib/types'

const TONE_CLASS = {
  danger: 'text-status-blocked',
  warn: 'text-warn',
  default: 'text-foreground',
} as const

/**
 * One project on the home: a single headline number (see `projectHeadline`),
 * one line of context, and the full counts on hover.
 */
export function ProjectCard({
  project,
  index,
  beads,
}: {
  project: Project
  /** Registry position; picks the chip color. */
  index: number
  beads?: Bead[]
}) {
  const [isEditing, setIsEditing] = useState(false)
  const [isDeleting, setIsDeleting] = useState(false)
  const { counts } = project
  const problem = projectProblem(project)
  const headline = projectHeadline(project, beads)
  const open = counts.open + counts.deferred
  const active = beads ? lastActivity(beads) : undefined

  // Context line: what the headline did not already say.
  const meta = problem
    ? [project.dir]
    : [
        headline.label !== 'open' && open > 0 ? `${open} open` : null,
        counts.in_progress > 0 ? `${counts.in_progress} in progress` : null,
        active ? `active ${relativeDate(active)}` : null,
      ].filter(Boolean)

  const details = [
    { label: 'open', value: open },
    { label: 'in progress', value: counts.in_progress },
    { label: 'blocked', value: counts.blocked },
    { label: 'ready', value: beads ? beads.filter(isReady).length : null },
    { label: 'closed', value: counts.closed },
  ]

  const ProblemIcon = problem ? SIGNAL_ICON[problem.kind].icon : null

  return (
    <>
      <div className="group relative">
        <HoverCard openDelay={500} closeDelay={80}>
          <HoverCardTrigger asChild>
            <Link
              to="/p/$project"
              params={{ project: project.id }}
              className="flex h-full flex-col gap-3 rounded-xl bg-card p-4 ring-1 ring-transparent ring-inset outline-none transition-colors hover:bg-card-hover hover:ring-border focus-visible:ring-2 focus-visible:ring-ring/60"
            >
              <span className="flex min-w-0 items-center gap-2.5 pr-12">
                <ProjectChip name={project.name} index={index} size={22} />
                <span className="truncate text-sm font-medium text-foreground">
                  {project.name}
                </span>
              </span>
              <span
                className={cn(
                  'flex min-w-0 items-baseline gap-2',
                  TONE_CLASS[headline.tone],
                )}
              >
                {ProblemIcon ? (
                  <ProblemIcon
                    className="size-4 shrink-0 self-center"
                    aria-hidden="true"
                  />
                ) : null}
                {headline.value !== null ? (
                  <span className="text-metric leading-none font-semibold tabular-nums">
                    {headline.value}
                  </span>
                ) : null}
                <span
                  className={cn(
                    'truncate text-body',
                    headline.value !== null &&
                      headline.tone === 'default' &&
                      'text-muted-foreground',
                  )}
                >
                  {headline.label}
                </span>
              </span>
              <span
                className="truncate text-xs text-muted-foreground"
                title={problem ? project.dir : undefined}
              >
                {meta.length > 0 ? meta.join(' · ') : 'No activity yet'}
              </span>
            </Link>
          </HoverCardTrigger>
          {problem ? null : (
            <HoverCardContent align="start" className="w-auto">
              <dl className="flex gap-4 text-xs text-muted-foreground">
                {details.map((d) => (
                  <div key={d.label} className="flex items-baseline gap-1">
                    <dt className="sr-only">{d.label}</dt>
                    <dd className="font-medium text-foreground tabular-nums">
                      {d.value ?? '–'}
                    </dd>
                    <span aria-hidden="true">{d.label}</span>
                  </div>
                ))}
              </dl>
            </HoverCardContent>
          )}
        </HoverCard>
        <ArrowRight
          className="pointer-events-none absolute top-[22px] right-4 size-3.5 text-faint transition-colors group-hover:text-foreground"
          aria-hidden="true"
        />
        <ProjectActionsMenu
          projectName={project.name}
          side="left"
          onEdit={() => setIsEditing(true)}
          onDelete={() => setIsDeleting(true)}
          className={cn(
            'absolute top-3 right-9 focus-visible:opacity-100',
            // A broken project keeps its menu visible: Edit (fix the path)
            // and Delete are the only ways to resolve it from the home.
            problem?.kind === 'missing' || problem?.kind === 'error'
              ? 'opacity-100'
              : 'opacity-0 group-hover:opacity-100',
          )}
          iconClassName="size-4"
        />
      </div>
      {isEditing && (
        <EditProjectModal
          open={isEditing}
          onOpenChange={setIsEditing}
          project={project}
        />
      )}
      {isDeleting && (
        <ConfirmDeleteModal
          open={isDeleting}
          onOpenChange={setIsDeleting}
          projectId={project.id}
          projectName={project.name}
        />
      )}
    </>
  )
}
