import { useQuery } from '@tanstack/react-query'
import { createFileRoute } from '@tanstack/react-router'

import { InboxView } from '@/components/inbox-view'
import { useAllProjectBeads } from '@/hooks/use-all-project-beads'
import { getProjects } from '@/lib/server'

import type { Project } from '@/lib/types'

export const Route = createFileRoute('/inbox')({ component: InboxPage })

function InboxPage() {
  const { data, isPending, isError, error } = useQuery({
    queryKey: ['projects'],
    queryFn: () => getProjects(),
    staleTime: 5000,
  })

  if (isPending)
    return <p className="text-body text-muted-foreground">Loading…</p>
  if (isError) {
    return (
      <p className="text-body text-destructive">
        {error instanceof Error ? error.message : String(error)}
      </p>
    )
  }
  return <InboxContent projects={data} />
}

function InboxContent({ projects }: { projects: Project[] }) {
  const beadsByProject = useAllProjectBeads(projects)
  return <InboxView projects={projects} beadsByProject={beadsByProject} />
}
