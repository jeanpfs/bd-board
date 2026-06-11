import {
  HeadContent,
  Scripts,
  createRootRouteWithContext,
} from '@tanstack/react-router'

import { TopNav } from '@/components/top-nav'
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
          <div className="flex min-h-dvh flex-col bg-background">
            <TopNav />
            <main
              id="main-content"
              tabIndex={-1}
              className="mx-auto w-full max-w-[1600px] flex-1 px-3 py-5 outline-none sm:px-4 lg:px-6 lg:py-6"
            >
              {children}
            </main>
          </div>
          <Toaster richColors position="top-right" />
        </TooltipProvider>
        <Scripts />
      </body>
    </html>
  )
}
