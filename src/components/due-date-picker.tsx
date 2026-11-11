import { useState } from 'react'
import { useMutation, useQueryClient } from '@tanstack/react-query'
import { differenceInCalendarDays, format } from 'date-fns'
import { toast } from 'sonner'

import { Button } from '@/components/ui/button'
import { Calendar } from '@/components/ui/calendar'
import { InteractiveRow } from '@/components/ui/interactive-row'
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from '@/components/ui/popover'
import { localDateParam, QUICK_DUE } from '@/lib/schedule'
import { updateBeadFn } from '@/lib/server'
import { cn, toErrorMessage } from '@/lib/utils'

import type { Bead } from '@/lib/types'

/** Days-until label for the trigger; warns only within a week. */
function dueWarning(dueAt: string, now: Date): string | null {
  const days = differenceInCalendarDays(new Date(dueAt), now)
  if (days < 0) return 'overdue'
  if (days === 0) return 'today'
  if (days <= 7) return `in ${days} ${days === 1 ? 'day' : 'days'}`
  return null
}

/** Due date trigger and popover; `Set due date` saves the chosen `bd update --due` value. */
export function DueDatePicker({
  project,
  bead,
}: {
  project: string
  bead: Bead
}) {
  const queryClient = useQueryClient()
  const [open, setOpen] = useState(false)
  const [draft, setDraft] = useState<string | null>(null)
  const [pickedDay, setPickedDay] = useState<Date | undefined>(undefined)

  const now = new Date()
  const due = bead.due_at ? new Date(bead.due_at) : undefined
  const warning = bead.due_at ? dueWarning(bead.due_at, now) : null

  const mutation = useMutation({
    mutationFn: (value: string) =>
      updateBeadFn({ data: { project, id: bead.id, update: { due: value } } }),
    onSuccess: () => {
      setOpen(false)
      setDraft(null)
      setPickedDay(undefined)
      queryClient.invalidateQueries({ queryKey: ['beads', project] })
      queryClient.invalidateQueries({ queryKey: ['bead', project, bead.id] })
    },
    onError: (error) => {
      toast.error(toErrorMessage(error, 'Failed to set due date'))
    },
  })

  function pickDay(day: Date) {
    setPickedDay(day)
    setDraft(localDateParam(day))
  }

  function pickQuick(value: string) {
    setPickedDay(undefined)
    setDraft(value)
  }

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        <Button variant="outline" size="sm" className="h-[30px] rounded-[7px]">
          {due ? (
            <span className="tabular-nums">{format(due, 'EEE, MMM d')}</span>
          ) : (
            <span className="text-muted-foreground">No due date</span>
          )}
          {warning ? (
            <span className="text-badge text-muted-foreground">{warning}</span>
          ) : null}
        </Button>
      </PopoverTrigger>
      <PopoverContent align="start" className="w-[268px] gap-3 p-3">
        <div className="flex flex-col gap-1">
          {QUICK_DUE.map((quick) => (
            <InteractiveRow
              key={quick.label}
              variant="plain"
              size="compact"
              aria-pressed={draft === quick.value}
              className={cn(
                draft === quick.value && 'bg-accent text-accent-foreground',
              )}
              onClick={() => pickQuick(quick.value)}
            >
              <span>{quick.label}</span>
            </InteractiveRow>
          ))}
        </div>
        <Calendar selected={pickedDay} onSelect={pickDay} />
        <p className="truncate font-mono text-badge text-muted-foreground">
          bd update {bead.id} --due {draft ?? '<value>'}
        </p>
        <div className="flex items-center justify-between gap-2">
          <Button
            variant="outline"
            size="sm"
            disabled={mutation.isPending || !bead.due_at}
            onClick={() => mutation.mutate('')}
          >
            Clear
          </Button>
          <Button
            size="sm"
            disabled={mutation.isPending || draft === null}
            onClick={() => {
              if (draft !== null) mutation.mutate(draft)
            }}
          >
            Set due date
          </Button>
        </div>
      </PopoverContent>
    </Popover>
  )
}
