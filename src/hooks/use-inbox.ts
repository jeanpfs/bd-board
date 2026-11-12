import { useQuery, useQueries, useQueryClient } from '@tanstack/react-query'

import { projectProblem } from '@/lib/attention'
import { describeEvents, unreadCount } from '@/lib/events'
import type { BdEvent, InboxItem } from '@/lib/events'
import { tailEventsFn } from '@/lib/server'

import type { Project } from '@/lib/types'

/** Journal records requested per `events tail` call. */
const PAGE_SIZE = 500
/** Newest entries kept per project. */
const WINDOW = 200
const READ_STORAGE_KEY = 'bd-board:inbox-read'

export interface InboxEntry extends InboxItem {
  projectId: string
  projectName: string
}

export interface ProjectInbox {
  /** Newest first. */
  entries: InboxEntry[]
  /** Highest journal seq seen; the "mark all read" cursor. */
  latestSeq: number
  /** The journal was pruned before the first record we could read. */
  pruned: boolean
}

export interface ProjectInboxState {
  data?: ProjectInbox
  error: Error | null
  isPending: boolean
  unread: number
  refetch: () => void
}

/**
 * Pages the whole journal forward from seq 0: `--limit` returns the oldest
 * records after `--since`, so the newest ones are only reached by paging.
 */
async function loadJournal(
  project: Project,
): Promise<{ events: BdEvent[]; pruned: boolean }> {
  const events: BdEvent[] = []
  let since = 0
  let pruned = false
  for (;;) {
    const page = await tailEventsFn({
      data: { project: project.id, since, limit: PAGE_SIZE },
    })
    if (page.truncated) {
      // Records before the floor are gone; continue from the floor.
      if (page.truncated.floor <= since) break
      pruned = true
      since = page.truncated.floor
      continue
    }
    events.push(...page.events)
    if (page.events.length < PAGE_SIZE) break
    since = page.events[page.events.length - 1].seq
  }
  return { events, pruned }
}

async function loadProjectInbox(project: Project): Promise<ProjectInbox> {
  const { events, pruned } = await loadJournal(project)
  const described = describeEvents(events, new Map()).slice(-WINDOW).reverse()
  return {
    entries: described.map((item) => ({
      ...item,
      projectId: project.id,
      projectName: project.name,
    })),
    latestSeq: events.length > 0 ? events[events.length - 1].seq : 0,
    pruned,
  }
}

function loadReadCursors(): Record<string, number> {
  try {
    const parsed: unknown = JSON.parse(
      localStorage.getItem(READ_STORAGE_KEY) ?? '{}',
    )
    return typeof parsed === 'object' && parsed !== null
      ? (parsed as Record<string, number>)
      : {}
  } catch {
    return {}
  }
}

/**
 * Journal activity for every readable project plus the unread count, which is
 * the number of entries newer than each project's read cursor.
 */
export function useInbox(projects: Project[]) {
  const queryClient = useQueryClient()
  const readable = projects.filter((p) => !projectProblem(p))
  const cursors = useQuery({
    queryKey: ['inbox-read'],
    queryFn: loadReadCursors,
    staleTime: Infinity,
  })
  const readCursors = cursors.data ?? {}

  const states = useQueries({
    queries: readable.map((project) => ({
      queryKey: ['inbox', project.id],
      queryFn: () => loadProjectInbox(project),
      staleTime: 10_000,
      refetchInterval: 15_000,
      retry: false,
    })),
    combine: (results) =>
      new Map(
        readable.map((project, i): [string, ProjectInboxState] => {
          const result = results[i]
          return [
            project.id,
            {
              data: result.data,
              error: result.error,
              isPending: result.isPending,
              unread: result.data
                ? unreadCount(result.data.entries, readCursors[project.id] ?? 0)
                : 0,
              refetch: () => void result.refetch(),
            },
          ]
        }),
      ),
  })

  const unread = [...states.values()].reduce((sum, s) => sum + s.unread, 0)

  function markAllRead() {
    const next: Record<string, number> = { ...readCursors }
    for (const [projectId, state] of states) {
      if (state.data) next[projectId] = state.data.latestSeq
    }
    try {
      localStorage.setItem(READ_STORAGE_KEY, JSON.stringify(next))
    } catch {
      // storage unavailable: the cursor lasts for this session only
    }
    queryClient.setQueryData(['inbox-read'], next)
  }

  return { states, unread, markAllRead, cursors: readCursors }
}
