import { Link, useRouterState } from '@tanstack/react-router'
import { FolderKanban } from 'lucide-react'

import { AppIcon } from '@/components/app-icon'
import { cn } from '@/lib/utils'

export function TopNav() {
  const pathname = useRouterState({
    select: (state) => state.location.pathname,
  })
  const projectsActive = pathname === '/' || pathname.startsWith('/p/')

  return (
    <header className="sticky top-0 z-40 w-full border-b border-border/80 bg-background/90 shadow-[0_1px_0_color-mix(in_oklch,var(--foreground)_5%,transparent)] backdrop-blur-xl supports-[backdrop-filter]:bg-background/75">
      <div className="mx-auto flex h-14 w-full max-w-[1600px] items-center gap-3 px-3 sm:px-4 lg:px-6">
        <Link
          to="/"
          aria-label="bd board home"
          className="group -ml-1 inline-flex h-10 min-w-0 items-center gap-2 rounded-lg px-1.5 outline-none transition-colors hover:bg-muted/45 focus-visible:ring-2 focus-visible:ring-ring/60"
        >
          <AppIcon className="size-8 rounded-lg" />
          <span className="min-w-0 text-sm font-semibold tracking-tight text-foreground">
            bd board
          </span>
        </Link>

        <nav
          aria-label="Primary"
          className="ml-auto flex min-w-0 items-center gap-1"
        >
          <Link
            to="/"
            aria-current={projectsActive ? 'page' : undefined}
            aria-label="Projects"
            className={cn(
              'inline-flex h-8 items-center gap-1.5 rounded-lg px-2.5 text-sm font-medium outline-none transition-colors focus-visible:ring-2 focus-visible:ring-ring/60',
              projectsActive
                ? 'bg-muted text-foreground ring-1 ring-foreground/10'
                : 'text-muted-foreground hover:bg-muted/55 hover:text-foreground',
            )}
          >
            <FolderKanban className="size-4" aria-hidden="true" />
            <span className="hidden sm:inline">Projects</span>
          </Link>
        </nav>
      </div>
    </header>
  )
}
