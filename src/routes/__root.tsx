import { useEffect } from 'react'
import {
  HeadContent,
  Scripts,
  createRootRouteWithContext,
} from '@tanstack/react-router'

import { ProjectRail } from '@/components/project-rail'
import { ProjectTopbar } from '@/components/project-topbar'
import { CommandPalette } from '@/components/command-palette'
import { ShortcutsDialog } from '@/components/shortcuts-dialog'
import { TooltipProvider } from '@/components/ui/tooltip'
import { Toaster } from '@/components/ui/sonner'

import appCss from '../styles.css?url'

import type { QueryClient } from '@tanstack/react-query'

interface MyRouterContext {
  queryClient: QueryClient
}

export const Route = createRootRouteWithContext<MyRouterContext>()({
  head: () => ({
    meta: [
      {
        charSet: 'utf-8',
      },
      {
        name: 'viewport',
        content: 'width=device-width, initial-scale=1',
      },
      {
        title: 'bd · board',
      },
    ],
    links: [
      {
        rel: 'stylesheet',
        href: appCss,
      },
    ],
  }),
  shellComponent: RootDocument,
})

function RootDocument({ children }: { children: React.ReactNode }) {
  // Effects run children first, so by now every listener (Mod+K, sidebar
  // toggle) is attached. Tests wait for this before driving the app.
  useEffect(() => {
    document.documentElement.dataset.hydrated = 'true'
  }, [])

  return (
    <html lang="en" className="dark">
      <head>
        <HeadContent />
      </head>
      <body className="min-h-screen bg-background text-foreground antialiased">
        <TooltipProvider>
          <a href="#main-content" className="skip-link">
            Skip to content
          </a>
          <div className="flex min-h-dvh bg-background">
            <ProjectRail />
            <div className="flex min-w-0 flex-1 flex-col">
              <ProjectTopbar />
              <main
                id="main-content"
                tabIndex={-1}
                className="mx-auto w-full max-w-[1600px] flex-1 px-3 py-5 outline-none sm:px-4 lg:px-6 lg:py-6"
              >
                {children}
              </main>
            </div>
          </div>
          <Toaster richColors position="top-right" />
          <CommandPalette />
          <ShortcutsDialog />
        </TooltipProvider>
        <Scripts />
      </body>
    </html>
  )
}
