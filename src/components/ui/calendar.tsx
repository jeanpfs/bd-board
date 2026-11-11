import { useState } from 'react'
import {
  addMonths,
  eachDayOfInterval,
  endOfMonth,
  endOfWeek,
  format,
  isSameDay,
  isSameMonth,
  startOfMonth,
  startOfWeek,
  subMonths,
} from 'date-fns'
import { ChevronLeft, ChevronRight } from 'lucide-react'

import { Button } from '@/components/ui/button'
import { cn } from '@/lib/utils'

const WEEK_OPTIONS = { weekStartsOn: 1 } as const
const WEEKDAYS = ['Mo', 'Tu', 'We', 'Th', 'Fr', 'Sa', 'Su']

interface CalendarProps {
  selected?: Date
  onSelect: (day: Date) => void
}

/** Month grid, weeks start on Monday. Days are selected by local calendar day. */
function Calendar({ selected, onSelect }: CalendarProps) {
  const [month, setMonth] = useState(() => startOfMonth(selected ?? new Date()))
  const days = eachDayOfInterval({
    start: startOfWeek(startOfMonth(month), WEEK_OPTIONS),
    end: endOfWeek(endOfMonth(month), WEEK_OPTIONS),
  })

  return (
    <div className="flex flex-col gap-2" data-slot="calendar">
      <div className="flex items-center justify-between">
        <Button
          variant="ghost"
          size="icon-xs"
          aria-label="Previous month"
          onClick={() => setMonth((m) => subMonths(m, 1))}
        >
          <ChevronLeft aria-hidden="true" />
        </Button>
        <span className="text-sm font-medium">
          {format(month, 'MMMM yyyy')}
        </span>
        <Button
          variant="ghost"
          size="icon-xs"
          aria-label="Next month"
          onClick={() => setMonth((m) => addMonths(m, 1))}
        >
          <ChevronRight aria-hidden="true" />
        </Button>
      </div>
      <div className="grid grid-cols-7 gap-0.5 text-center text-badge text-faint">
        {WEEKDAYS.map((day) => (
          <span key={day}>{day}</span>
        ))}
      </div>
      <div className="grid grid-cols-7 gap-0.5">
        {days.map((day) => {
          const isSelected = selected !== undefined && isSameDay(day, selected)
          return (
            <Button
              key={day.toISOString()}
              variant={isSelected ? 'default' : 'ghost'}
              size="icon-xs"
              aria-label={format(day, 'PPP')}
              aria-pressed={isSelected}
              className={cn(
                'font-mono text-badge tabular-nums',
                !isSameMonth(day, month) && 'text-muted-foreground/50',
              )}
              onClick={() => onSelect(day)}
            >
              {format(day, 'd')}
            </Button>
          )
        })}
      </div>
    </div>
  )
}

export { Calendar }
