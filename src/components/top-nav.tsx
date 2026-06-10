import { Link } from '@tanstack/react-router'
import { Boxes } from 'lucide-react'

export function TopNav() {
  return (
    <header className="sticky top-0 z-40 w-full border-b border-border/80 bg-background/80 backdrop-blur-md supports-[backdrop-filter]:bg-background/60">
      <div className="mx-auto flex h-12 w-full max-w-[1600px] items-center gap-3 px-4">
        <Link
          to="/"
          className="group flex items-center gap-2 rounded-md outline-none transition-opacity hover:opacity-90 focus-visible:ring-2 focus-visible:ring-ring/60"
        >
          <span className="flex size-6 items-center justify-center rounded-md bg-primary/15 text-primary ring-1 ring-inset ring-primary/25">
            <Boxes className="size-3.5" aria-hidden="true" />
          </span>
          <span className="flex items-baseline gap-0.5 text-sm font-semibold tracking-tight text-foreground">
            <span>bd</span>
            <span className="text-muted-foreground/70">·</span>
            <span>board</span>
          </span>
        </Link>
      </div>
    </header>
  )
}
