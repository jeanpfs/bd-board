import { createFileRoute } from '@tanstack/react-router'
import { beadFeedResponse } from '@/lib/bead-feed-server'

export const Route = createFileRoute('/api/feed/$project')({
  server: {
    handlers: {
      GET: ({ request, params }) => beadFeedResponse(request, params.project),
    },
  },
})
