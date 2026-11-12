import { useQuery } from '@tanstack/react-query'
import { createFileRoute } from '@tanstack/react-router'
import { useEffect, useMemo, useState } from 'react'

import { MyWorkList, myWorkItems } from '@/components/my-work'
import type { Located } from '@/components/my-work'
import { useAllProjectBeads } from '@/hooks/use-all-project-beads'
import { getStoredIdentity } from '@/lib/identity'
import { getProjects } from '@/lib/server'

import type { Project } from '@/lib/types'

export const Route = createFileRoute('/my-work')({ component: MyWorkPage })

function MyWorkPage() {
  const { data, isPending, isError, error } = useQuery({
    queryKey: ['projects'],
    queryFn: () => getProjects(),
    staleTime: 5000,
  })

  return (
    <div className="mx-auto flex max-w-[1160px] flex-col gap-section pb-page">
      <header>
        <h1 className="text-title font-semibold tracking-[-0.01em]">My work</h1>
      </header>
      {isPending ? (
        <p className="text-body text-muted-foreground">Loading…</p>
      ) : isError ? (
        <p className="text-body text-destructive">
          {error instanceof Error ? error.message : String(error)}
        </p>
      ) : (
        <MyWorkContent projects={data} />
      )}
    </div>
  )
}

function MyWorkContent({ projects }: { projects: Project[] }) {
  const beadsByProject = useAllProjectBeads(projects)
  const [identity, setIdentity] = useState<string | null>(null)
  useEffect(() => {
    setIdentity(getStoredIdentity())
  }, [])

  const located = useMemo(() => {
    const all: Located[] = []
    projects.forEach((project, index) => {
      for (const bead of beadsByProject.get(project.id) ?? []) {
        all.push({ bead, project, index })
      }
    })
    return all
  }, [projects, beadsByProject])

  return (
    <MyWorkList items={myWorkItems(located, identity)} identity={identity} />
  )
}
