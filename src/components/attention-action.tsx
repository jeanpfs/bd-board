import * as React from 'react'
import { useMutation, useQueryClient } from '@tanstack/react-query'
import { toast } from 'sonner'

import { Button } from '@/components/ui/button'
import type { Attention } from '@/lib/attention'
import { toErrorMessage } from '@/lib/utils'
import { reclaimBeadFn, resolveGateFn } from '@/lib/server'

/**
 * The one action for a needs-you row: Reclaim for an expired lease, Resolve
 * gate for a gate wait. Other kinds render `fallback` (usually "Open").
 */
export function AttentionAction({
  item,
  project,
  fallback,
}: {
  item: Attention
  project: string
  fallback: React.ReactNode
}) {
  const queryClient = useQueryClient()
  const mutation = useMutation({
    mutationFn: async () => {
      if (item.kind === 'lease-expired') {
        await reclaimBeadFn({ data: { project, id: item.bead.id } })
        return `Reclaimed ${item.bead.id}`
      }
      await resolveGateFn({ data: { project, id: item.gateId ?? '' } })
      return `Resolved gate ${item.gateId}`
    },
    onSuccess: (message) => {
      toast.success(message)
    },
    onError: (error) => {
      toast.error(
        toErrorMessage(
          error,
          item.kind === 'lease-expired'
            ? 'Failed to reclaim bead'
            : 'Failed to resolve gate',
        ),
      )
    },
    onSettled: () => {
      queryClient.invalidateQueries({ queryKey: ['beads', project] })
      queryClient.invalidateQueries({ queryKey: ['projects'] })
    },
  })

  if (item.kind === 'lease-expired') {
    return (
      <Button
        size="sm"
        variant="outline"
        disabled={mutation.isPending}
        onClick={() => mutation.mutate()}
      >
        Reclaim
      </Button>
    )
  }
  if (item.kind === 'gate' && item.gateId) {
    return (
      <Button
        size="sm"
        variant="outline"
        disabled={mutation.isPending}
        onClick={() => mutation.mutate()}
      >
        Resolve gate
      </Button>
    )
  }
  return <>{fallback}</>
}
