import * as React from 'react'
import { cva } from 'class-variance-authority'
import type { VariantProps } from 'class-variance-authority'

import { cn } from '@/lib/utils'

const interactiveRowVariants = cva(
  'block w-full text-left outline-none transition-colors focus-visible:ring-2 focus-visible:ring-ring/60 disabled:cursor-default',
  {
    variants: {
      variant: {
        surface:
          'bg-card ring-1 ring-inset ring-border hover:bg-card-hover hover:ring-ring/40 disabled:hover:bg-card disabled:hover:ring-border',
        plain: '',
      },
      size: {
        compact: 'flex items-center gap-2.5 rounded-[8px] px-[10px] py-2',
        cozy: 'flex gap-[11px] rounded-[9px] px-3 py-2.5',
        flush: '',
      },
    },
    defaultVariants: {
      variant: 'surface',
      size: 'compact',
    },
  },
)

interface InteractiveRowProps
  extends React.ComponentProps<'button'>,
    VariantProps<typeof interactiveRowVariants> {
  active?: boolean
}

function InteractiveRow({
  className,
  variant,
  size,
  active = false,
  ...props
}: InteractiveRowProps) {
  return (
    <button
      type="button"
      data-slot="interactive-row"
      data-active={active || undefined}
      className={cn(
        interactiveRowVariants({ variant, size }),
        active && 'ring-ring/45 hover:bg-card hover:ring-ring/45',
        className,
      )}
      {...props}
    />
  )
}

export { InteractiveRow, interactiveRowVariants }
