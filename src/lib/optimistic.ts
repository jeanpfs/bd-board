import type { QueryClient } from '@tanstack/react-query'

import type { Bead, BeadUpdate } from './types'

/** The cached bead fields a `bd update` will change, so the UI can show them before bd answers. */
export function beadPatchFromUpdate(update: BeadUpdate): Partial<Bead> {
  const { due, estimate, ...fields } = update
  const patch: Partial<Bead> = { ...fields }
  if (due === '') {
    patch.due_at = undefined
  } else if (due !== undefined && /^\d{4}-\d{2}-\d{2}$/.test(due)) {
    // A bare date parses as UTC midnight, which is the previous day west of UTC.
    patch.due_at = `${due}T00:00:00`
  }
  // Relative values (`tomorrow`, `+2w`) are resolved by bd; the refetch shows them.
  if (estimate !== undefined) patch.estimated_minutes = estimate
  if (update.assignee !== undefined)
    patch.assignee = update.assignee || undefined
  return patch
}

/**
 * Applies `patch` to the cached board list and bead detail right away and
 * returns the undo. In-flight refetches are cancelled first so an older
 * response cannot overwrite the patch; callers still invalidate afterwards.
 */
export async function patchCachedBead(
  queryClient: QueryClient,
  project: string,
  id: string,
  patch: Partial<Bead>,
): Promise<() => void> {
  const listKey = ['beads', project]
  const detailKey = ['bead', project, id]
  await Promise.all([
    queryClient.cancelQueries({ queryKey: listKey }),
    queryClient.cancelQueries({ queryKey: detailKey }),
  ])
  const previousList = queryClient.getQueryData<Bead[]>(listKey)
  const previousDetail = queryClient.getQueryData<Bead>(detailKey)

  if (previousList) {
    queryClient.setQueryData<Bead[]>(
      listKey,
      previousList.map((bead) =>
        bead.id === id ? { ...bead, ...patch } : bead,
      ),
    )
  }
  if (previousDetail) {
    queryClient.setQueryData<Bead>(detailKey, { ...previousDetail, ...patch })
  }

  return () => {
    if (previousList) queryClient.setQueryData(listKey, previousList)
    if (previousDetail) queryClient.setQueryData(detailKey, previousDetail)
  }
}
