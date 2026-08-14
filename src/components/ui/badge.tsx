import * as React from 'react'
import { cva } from 'class-variance-authority'
import type { VariantProps } from 'class-variance-authority'
import { Slot } from 'radix-ui'
import { X } from 'lucide-react'

import { cn } from '@/lib/utils'

const badgeVariants = cva(
  'group/badge inline-flex h-5 w-fit shrink-0 items-center justify-center gap-1 overflow-hidden rounded-4xl border border-transparent px-2 py-0.5 text-xs font-medium whitespace-nowrap transition-all focus-visible:border-ring focus-visible:ring-[3px] focus-visible:ring-ring/50 has-data-[icon=inline-end]:pr-1.5 has-data-[icon=inline-start]:pl-1.5 aria-invalid:border-destructive aria-invalid:ring-destructive/20 dark:aria-invalid:ring-destructive/40 [&>svg]:pointer-events-none [&>svg]:size-3!',
  {
    variants: {
      variant: {
        default:
          'bg-primary text-primary-foreground [a]:hover:bg-primary-hover',
        secondary:
          'bg-secondary text-secondary-foreground [a]:hover:bg-secondary/80',
        destructive:
          'bg-destructive/10 text-destructive focus-visible:ring-destructive/20 dark:bg-destructive/20 dark:focus-visible:ring-destructive/40 [a]:hover:bg-destructive/20',
        outline:
          'border-border text-foreground [a]:hover:bg-muted [a]:hover:text-muted-foreground',
        ghost:
          'hover:bg-muted hover:text-muted-foreground dark:hover:bg-muted/50',
        link: 'text-primary-text underline-offset-4 hover:underline',
        filter:
          'h-6 gap-1 rounded-full bg-primary/26 px-2 text-xs font-medium text-primary-text ring-1 ring-inset ring-ring/55 transition-colors hover:bg-primary/35',
      },
    },
    defaultVariants: {
      variant: 'default',
    },
  },
)

interface BadgeProps
  extends React.HTMLAttributes<HTMLElement>,
    VariantProps<typeof badgeVariants> {
  asChild?: boolean
  onClick?: React.MouseEventHandler
  onRemove?: () => void
  disabled?: boolean
}

function Badge({
  className,
  variant = 'default',
  asChild = false,
  onClick,
  onRemove,
  children,
  ...props
}: BadgeProps) {
  const Comp: React.ElementType = asChild ? Slot.Root : onClick ? 'button' : 'span'

  return (
    <Comp
      data-slot="badge"
      data-variant={variant}
      type={Comp === 'button' ? 'button' : undefined}
      onClick={onClick}
      className={cn(badgeVariants({ variant }), className)}
      {...props}
    >
      {children}
      {onRemove ? (
        <button
          type="button"
          onClick={onRemove}
          aria-label="Remove"
          className="-mr-0.5 ml-0.5 rounded-full p-0.5 hover:bg-black/15"
        >
          <X className="size-3" aria-hidden="true" />
        </button>
      ) : null}
    </Comp>
  )
}

export { Badge, badgeVariants }
