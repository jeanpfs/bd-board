import { Link } from '@tanstack/react-router'

import { ProjectChip } from '@/components/project-chip'
import { LIST_ROW } from '@/components/home-sections'
import { groupBeadLinks, mapStatus, statusText } from '@/lib/types'

import type { Bead, Project } from '@/lib/types'

/** A bead together with the project it lives in and that project's color. */
export interface Located {
  bead: Bead
  project: Project
  index: number
}

/** Beads assigned to `identity` that are not closed; in progress first, then priority. */
export function myWorkItems(
  located: Located[],
  identity: string | null,
): Located[] {
  if (!identity) return []
  return located
    .filter(
      ({ bead }) =>
        bead.assignee === identity && mapStatus(bead).column !== 'closed',
    )
    .sort(
      (a, b) =>
        Number(mapStatus(b.bead).column === 'in_progress') -
          Number(mapStatus(a.bead).column === 'in_progress') ||
        a.bead.priority - b.bead.priority,
    )
}

export function BeadLinkRow({
  item,
  trailing,
}: {
  item: Located
  trailing: React.ReactNode
}) {
  const { bead, project, index } = item
  return (
    <li className="border-b border-border/60 last:border-0">
      <Link
        to="/p/$project"
        params={{ project: project.id }}
        search={{ bead: bead.id }}
        className={LIST_ROW}
      >
        <ProjectChip name={project.name} index={index} />
        <span className="shrink-0 font-mono text-xs text-muted-foreground">
          {bead.id}
        </span>
        <span className="min-w-0 flex-1 truncate text-foreground">
          {bead.title}
        </span>
        <span className="shrink-0 text-xs text-muted-foreground">
          {trailing}
        </span>
      </Link>
    </li>
  )
}

/** Rows of `items` (already filtered by `myWorkItems`), or the empty copy. */
export function MyWorkList({
  items,
  identity,
  limit,
}: {
  items: Located[]
  identity: string | null
  limit?: number
}) {
  if (!identity) {
    return (
      <p className="px-3 text-body text-muted-foreground">
        Pick yourself under <em>Assigned to me</em> in a project&apos;s sidebar
        to see your beads here.
      </p>
    )
  }
  if (items.length === 0) {
    return (
      <p className="px-3 text-body text-muted-foreground">
        Nothing open is assigned to {identity}.
      </p>
    )
  }
  return (
    <ul className="flex flex-col">
      {(limit === undefined ? items : items.slice(0, limit)).map((item) => {
        const waitsOn = groupBeadLinks(item.bead.links).blockedBy[0]
        return (
          <BeadLinkRow
            key={`${item.project.id}:${item.bead.id}`}
            item={item}
            trailing={
              waitsOn && mapStatus(item.bead).column === 'open'
                ? `waits on ${waitsOn}`
                : statusText(item.bead)
            }
          />
        )
      })}
    </ul>
  )
}
