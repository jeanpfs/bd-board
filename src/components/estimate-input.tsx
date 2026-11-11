import { useState } from 'react'
import type { KeyboardEvent } from 'react'
import { useMutation, useQueryClient } from '@tanstack/react-query'
import { toast } from 'sonner'

import { Input } from '@/components/ui/input'
import { formatEstimate, parseEstimate } from '@/lib/schedule'
import { updateBeadFn } from '@/lib/server'
import { toErrorMessage } from '@/lib/utils'

import type { Bead } from '@/lib/types'

/** Estimate field; Enter saves `3h`, `90m` or `1h30m` as minutes. */
export function EstimateInput({
  project,
  bead,
}: {
  project: string
  bead: Bead
}) {
  const queryClient = useQueryClient()
  const [text, setText] = useState(() =>
    bead.estimated_minutes ? formatEstimate(bead.estimated_minutes) : '',
  )
  const minutes = parseEstimate(text)

  const mutation = useMutation({
    mutationFn: (estimate: number) =>
      updateBeadFn({
        data: { project, id: bead.id, update: { estimate } },
      }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['beads', project] })
      queryClient.invalidateQueries({ queryKey: ['bead', project, bead.id] })
    },
    onError: (error) => {
      toast.error(toErrorMessage(error, 'Failed to save estimate'))
    },
  })

  function save() {
    if (minutes === null) {
      toast.error('Use a value like 90m, 3h or 1h30m')
      return
    }
    mutation.mutate(minutes)
  }

  function onKeyDown(event: KeyboardEvent<HTMLInputElement>) {
    if (event.key !== 'Enter') return
    event.preventDefault()
    save()
  }

  return (
    <div className="flex items-center gap-2">
      <Input
        aria-label="Estimate"
        placeholder="e.g. 3h"
        value={text}
        disabled={mutation.isPending}
        onChange={(event) => setText(event.target.value)}
        onKeyDown={onKeyDown}
        className="h-[30px] w-24 rounded-[7px] font-mono"
      />
      {minutes !== null ? (
        <span className="font-mono text-badge text-faint tabular-nums">
          {minutes} min
        </span>
      ) : null}
    </div>
  )
}
