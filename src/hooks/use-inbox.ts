import { useEffect } from 'react'
import { useQuery, useQueries, useQueryClient } from '@tanstack/react-query'

import { projectProblem } from '@/lib/attention'
import { getStoredIdentity } from '@/lib/identity'
import { describeEvents, unreadCount } from '@/lib/events'
import type { BdEvent, InboxItem } from '@/lib/events'
import { tailEventsFn } from '@/lib/server'
import type { Bead, Project } from '@/lib/types'

/** Journal records requested per `events tail` call. */
const PAGE_SIZE = 500
/** Newest entries kept per project. */
const WINDOW = 200
/** Polling interval for each project's journal. */
const POLL_MS = 30_000
/** One read cursor per project, stored under this prefix. */
const CURSOR_PREFIX = 'bd-board:inbox-read:'
/** The old single-map store, migrated into per-project keys once. */
const LEGACY_CURSOR_KEY = 'bd-board:inbox-read'

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
  /** The events journal is off for this project. */
  disabled: boolean
  /** Last record seen per bead, so the next page can describe changes. */
  lastByBead: Map<string, Bead>
}

export interface ProjectInboxState {
  data?: ProjectInbox
  error: Error | null
  isPending: boolean
  disabled: boolean
  unread: number
  refetch: () => void
}

/**
 * Reads only records after the cached seq. The first load starts at seq 0 and
 * pages forward; later polls fetch just what is new.
 */
async function advanceProjectInbox(
  project: Project,
  prev: ProjectInbox | undefined,
): Promise<ProjectInbox> {
  let since = prev?.latestSeq ?? 0
  let pruned = prev?.pruned ?? false
  const fresh: BdEvent[] = []
  for (;;) {
    const page = await tailEventsFn({
      data: { project: project.id, since, limit: PAGE_SIZE },
    })
    if (page.disabled) {
      return {
        entries: [],
        latestSeq: 0,
        pruned: false,
        disabled: true,
        lastByBead: new Map(),
      }
    }
    if (page.truncated) {
      // Records before the floor are gone; continue from the floor.
      if (page.truncated.floor <= since) break
      pruned = true
      since = page.truncated.floor
      continue
    }
    fresh.push(...page.events)
    if (page.events.length < PAGE_SIZE) break
    since = page.events[page.events.length - 1].seq
  }

  const lastByBead = new Map(prev?.lastByBead)
  const described = describeEvents(fresh, new Map(lastByBead))
  for (const event of fresh) {
    if (event.issue) lastByBead.set(event.issue_id, event.issue)
  }
  const newest = described
    .map((item) => ({
      ...item,
      projectId: project.id,
      projectName: project.name,
    }))
    .reverse()
  return {
    entries: [...newest, ...(prev?.entries ?? [])].slice(0, WINDOW),
    latestSeq:
      fresh.length > 0 ? fresh[fresh.length - 1].seq : (prev?.latestSeq ?? 0),
    pruned,
    disabled: false,
    lastByBead,
  }
}

function parseCursor(raw: string | null): number | undefined {
  if (raw === null || raw.trim() === '') return undefined
  const value = Number(raw)
  return Number.isFinite(value) ? value : undefined
}

/** Moves the old single-map cursor store into per-project keys, once. */
function migrateLegacyCursors(storage: Storage): void {
  const legacy = storage.getItem(LEGACY_CURSOR_KEY)
  if (legacy === null) return
  try {
    const parsed: unknown = JSON.parse(legacy)
    if (typeof parsed === 'object' && parsed !== null) {
      for (const [projectId, value] of Object.entries(parsed)) {
        const key = CURSOR_PREFIX + projectId
        if (
          typeof value === 'number' &&
          Number.isFinite(value) &&
          storage.getItem(key) === null
        ) {
          storage.setItem(key, String(value))
        }
      }
    }
    storage.removeItem(LEGACY_CURSOR_KEY)
  } catch {
    // Unreadable or unavailable storage: the cursors start empty.
  }
}

function loadReadCursors(): Partial<Record<string, number>> {
  const cursors: Partial<Record<string, number>> = {}
  try {
    migrateLegacyCursors(localStorage)
    for (let i = 0; i < localStorage.length; i++) {
      const key = localStorage.key(i)
      if (key?.startsWith(CURSOR_PREFIX)) {
        const value = parseCursor(localStorage.getItem(key))
        if (value !== undefined) {
          cursors[key.slice(CURSOR_PREFIX.length)] = value
        }
      }
    }
  } catch {
    // Storage unavailable: no cursors, every entry counts as unread.
  }
  return cursors
}

function saveReadCursor(projectId: string, seq: number): void {
  try {
    localStorage.setItem(CURSOR_PREFIX + projectId, String(seq))
  } catch {
    // Storage unavailable: the cursor lasts for this session only.
  }
}

/**
 * Journal activity for every readable project plus the unread count: entries
 * addressed to the current identity that are newer than the project's cursor.
 */
export function useInbox(projects: Project[]) {
  const queryClient = useQueryClient()
  const readable = projects.filter((p) => !projectProblem(p))
  const identity = getStoredIdentity()
  const cursorQuery = useQuery({
    queryKey: ['inbox-read'],
    queryFn: loadReadCursors,
    staleTime: Infinity,
  })
  const readCursors = cursorQuery.data ?? {}

  const states = useQueries({
    queries: readable.map((project) => ({
      queryKey: ['inbox', project.id],
      queryFn: () =>
        advanceProjectInbox(
          project,
          queryClient.getQueryData<ProjectInbox>(['inbox', project.id]),
        ),
      staleTime: POLL_MS / 3,
      refetchInterval: POLL_MS,
      retry: false,
    })),
    combine: (results) =>
      new Map(
        readable.map((project, i): [string, ProjectInboxState] => {
          const result = results[i]
          const cursor = readCursors[project.id]
          return [
            project.id,
            {
              data: result.data,
              error: result.error,
              isPending: result.isPending,
              disabled: result.data?.disabled ?? false,
              unread:
                result.data && cursor !== undefined && identity !== null
                  ? unreadCount(result.data.entries, cursor, identity)
                  : 0,
              refetch: () => void result.refetch(),
            },
          ]
        }),
      ),
  })

  // A project seen for the first time starts at its latest seq, so existing
  // history is not reported as unread.
  useEffect(() => {
    const next = { ...readCursors }
    let changed = false
    for (const [projectId, state] of states) {
      if (!state.data || state.data.disabled) continue
      if (readCursors[projectId] !== undefined) continue
      next[projectId] = state.data.latestSeq
      saveReadCursor(projectId, state.data.latestSeq)
      changed = true
    }
    if (changed) queryClient.setQueryData(['inbox-read'], next)
  }, [states, readCursors, queryClient])

  const unread = [...states.values()].reduce((sum, s) => sum + s.unread, 0)

  function markAllRead() {
    const next: Partial<Record<string, number>> = { ...readCursors }
    for (const [projectId, state] of states) {
      if (!state.data || state.data.disabled) continue
      next[projectId] = state.data.latestSeq
      saveReadCursor(projectId, state.data.latestSeq)
    }
    queryClient.setQueryData(['inbox-read'], next)
  }

  return { states, unread, markAllRead, cursors: readCursors }
}
