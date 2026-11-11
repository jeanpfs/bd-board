import { useState } from 'react'
import { useMutation, useQueryClient } from '@tanstack/react-query'
import { format } from 'date-fns'
import { toast } from 'sonner'

import { Button } from '@/components/ui/button'
import { Calendar } from '@/components/ui/calendar'
import { InteractiveRow } from '@/components/ui/interactive-row'
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from '@/components/ui/popover'
import { localDateParam } from '@/lib/schedule'
import { deferBeadFn, undeferBeadFn } from '@/lib/server'
import { toErrorMessage } from '@/lib/utils'

import type { Bead } from '@/lib/types'

const SNOOZE_PRESETS = [
  { label: 'Tomorrow', value: 'tomorrow' },
  { label: 'Next Monday', value: 'next monday' },
  { label: 'In 1 week', value: '+1w' },
]

/** Hides a bead from Ready until a date; `Undefer` restores it immediately. */
export function SnoozeMenu({ project, bead }: { project: string; bead: Bead }) {
  const queryClient = useQueryClient()
  const [open, setOpen] = useState(false)
  const [picking, setPicking] = useState(false)
  const snoozedUntil = bead.defer_until ? new Date(bead.defer_until) : null

  const mutation = useMutation({
    mutationFn: (until: string | undefined) =>
      until === undefined
        ? undeferBeadFn({ data: { project, id: bead.id } })
        : deferBeadFn({ data: { project, id: bead.id, until } }),
    onSuccess: () => {
      setOpen(false)
      setPicking(false)
      queryClient.invalidateQueries({ queryKey: ['beads', project] })
      queryClient.invalidateQueries({ queryKey: ['bead', project, bead.id] })
    },
    onError: (error) => {
      toast.error(toErrorMessage(error, 'Failed to update snooze'))
    },
  })

  const snoozed = snoozedUntil !== null || bead.status === 'deferred'

  if (snoozed) {
    return (
      <div className="flex items-center gap-2">
        <span className="text-body tabular-nums">
          {snoozedUntil
            ? `Snoozed until ${format(snoozedUntil, 'EEE, MMM d')}`
            : 'Snoozed'}
        </span>
        <Button
          variant="outline"
          size="sm"
          disabled={mutation.isPending}
          onClick={() => mutation.mutate(undefined)}
        >
          Undefer
        </Button>
      </div>
    )
  }

  return (
    <div className="flex flex-col gap-1.5">
      <Popover
        open={open}
        onOpenChange={(next) => {
          setOpen(next)
          if (!next) setPicking(false)
        }}
      >
        <PopoverTrigger asChild>
          <Button
            variant="outline"
            size="sm"
            className="h-[30px] rounded-[7px]"
          >
            Defer until…
          </Button>
        </PopoverTrigger>
        <PopoverContent align="start" className="w-[268px] gap-2 p-2.5">
          {picking ? (
            <>
              <Calendar
                onSelect={(day) => mutation.mutate(localDateParam(day))}
              />
              <Button
                variant="ghost"
                size="sm"
                onClick={() => setPicking(false)}
              >
                Back
              </Button>
            </>
          ) : (
            <div className="flex flex-col gap-1">
              {SNOOZE_PRESETS.map((preset) => (
                <InteractiveRow
                  key={preset.label}
                  variant="plain"
                  size="compact"
                  disabled={mutation.isPending}
                  onClick={() => mutation.mutate(preset.value)}
                >
                  <span>{preset.label}</span>
                </InteractiveRow>
              ))}
              <InteractiveRow
                variant="plain"
                size="compact"
                disabled={mutation.isPending}
                onClick={() => setPicking(true)}
              >
                <span>Pick date…</span>
              </InteractiveRow>
            </div>
          )}
        </PopoverContent>
      </Popover>
      <span className="text-badge text-faint">
        hidden from Ready until then
      </span>
    </div>
  )
}
