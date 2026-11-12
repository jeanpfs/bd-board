import { useQueries } from '@tanstack/react-query'

import { projectProblem } from '@/lib/attention'
import { getBeads } from '@/lib/server'

import type { Bead, Project } from '@/lib/types'

/**
 * Bead lists for every readable project, keyed by project id. Shares the
 * board's `['beads', id]` cache, so opening a project from the home is instant.
 * Projects with a problem (missing folder, error, pending migration) are
 * skipped: `bd list` would fail on them.
 */
export function useAllProjectBeads(projects: Project[]): Map<string, Bead[]> {
  const readable = projects.filter((p) => !projectProblem(p))
  return useQueries({
    queries: readable.map((p) => ({
      queryKey: ['beads', p.id],
      queryFn: () => getBeads({ data: { project: p.id } }),
      staleTime: 15_000,
      refetchInterval: 30_000,
      retry: false,
    })),
    combine: (results) => {
      const byProject = new Map<string, Bead[]>()
      results.forEach((r, i) => {
        if (r.data) byProject.set(readable[i].id, r.data)
      })
      return byProject
    },
  })
}
