import { useState } from 'react'
import { MoreVertical } from 'lucide-react'

import { Button } from '@/components/ui/button'
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from '@/components/ui/popover'
import { cn } from '@/lib/utils'

/**
 * Edit/Delete menu for a project. Render it as a sibling of the project's
 * `<Link>`, never inside it: a trigger nested in the link needs
 * `preventDefault()` to stop navigation, and Radix skips the open toggle for
 * default-prevented clicks.
 */
export function ProjectActionsMenu({
  projectName,
  side,
  onEdit,
  onDelete,
  className,
  iconClassName,
}: {
  projectName: string
  side: 'left' | 'right'
  onEdit: () => void
  onDelete: () => void
  className?: string
  iconClassName?: string
}) {
  const [open, setOpen] = useState(false)

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        <Button
          size="icon-xs"
          variant="ghost"
          aria-label={`Actions for ${projectName}`}
          title="Project actions"
          className={cn(
            'text-muted-foreground hover:text-foreground data-[state=open]:opacity-100',
            className,
          )}
        >
          <MoreVertical className={iconClassName} aria-hidden="true" />
        </Button>
      </PopoverTrigger>
      <PopoverContent className="w-32 p-1" side={side} align="start">
        <div className="flex flex-col gap-0.5">
          <Button
            size="sm"
            variant="ghost"
            className="justify-start text-sm"
            onClick={() => {
              setOpen(false)
              onEdit()
            }}
          >
            Edit
          </Button>
          <Button
            size="sm"
            variant="ghost"
            className="justify-start text-sm text-destructive hover:text-destructive"
            onClick={() => {
              setOpen(false)
              onDelete()
            }}
          >
            Delete
          </Button>
        </div>
      </PopoverContent>
    </Popover>
  )
}
