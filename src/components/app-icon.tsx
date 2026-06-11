import * as React from 'react'

import { cn } from '@/lib/utils'

interface AppIconProps extends React.ComponentPropsWithoutRef<'svg'> {
  label?: string
}

export function AppIcon({ className, label, ...props }: AppIconProps) {
  const titleId = React.useId()

  return (
    <svg
      viewBox="0 0 1024 1024"
      xmlns="http://www.w3.org/2000/svg"
      role={label ? 'img' : undefined}
      aria-hidden={label ? undefined : true}
      aria-labelledby={label ? titleId : undefined}
      className={cn('block shrink-0', className)}
      {...props}
    >
      {label ? <title id={titleId}>{label}</title> : null}
      <rect
        x="8"
        y="8"
        width="1008"
        height="1008"
        rx="225"
        fill="#111111"
        stroke="#2A2A2A"
        strokeWidth="12"
      />
      <rect x="472" y="212" width="80" height="600" rx="40" fill="#475569" />
      <rect x="362" y="412" width="300" height="200" rx="100" fill="#00E5FF" />
    </svg>
  )
}
