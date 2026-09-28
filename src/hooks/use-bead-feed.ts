import { useQueryClient } from '@tanstack/react-query'
import { useEffect, useRef, useState } from 'react'
import { toast } from 'sonner'

import { enableEventsJournalFn, subscribeBeadFeed } from '@/lib/server'
import { toErrorMessage } from '@/lib/utils'

import type { BeadFeedMessage, BeadFeedStatus } from '@/lib/types'

const FEED_DEBOUNCE_MS = 300
const FEED_RETRY_MS = 15_000

function loadSeq(project: string): number {
  try {
    const n = Number(localStorage.getItem(`bd-board:feed-seq:${project}`))
    return Number.isSafeInteger(n) && n >= 0 ? n : 0
  } catch {
    return 0
  }
}

function saveSeq(project: string, seq: number) {
  try {
    if (seq > loadSeq(project)) {
      localStorage.setItem(`bd-board:feed-seq:${project}`, String(seq))
    }
  } catch {
    // storage unavailable: the feed restarts from 0 next time
  }
}

export interface UseBeadFeedResult {
  status: BeadFeedStatus
  message?: string
}

export function useBeadFeed(project: string): UseBeadFeedResult {
  const queryClient = useQueryClient()
  const [status, setStatus] = useState<BeadFeedStatus>('connecting')
  const [message, setMessage] = useState<string | undefined>(undefined)
  // Projects whose journal we already tried to enable this session: a journal
  // that is still off afterwards must not loop enable -> resubscribe forever.
  const enableTried = useRef(new Set<string>())
  const [attempt, setAttempt] = useState(0)

  useEffect(() => {
    setStatus('connecting')
    setMessage(undefined)
    let cancelled = false
    const pending = new Set<string>()
    let debounceTimer: ReturnType<typeof setTimeout> | undefined
    let retryTimer: ReturnType<typeof setTimeout> | undefined

    const invalidateBoard = () => {
      void queryClient.invalidateQueries({ queryKey: ['beads', project] })
      void queryClient.invalidateQueries({
        queryKey: ['project-knowledge', project],
      })
    }

    const handle = (msg: BeadFeedMessage) => {
      switch (msg.type) {
        case 'live':
          saveSeq(project, msg.seq)
          setStatus('live')
          setMessage(undefined)
          invalidateBoard()
          break
        case 'change':
          saveSeq(project, msg.seq)
          for (const id of msg.issueIds) pending.add(id)
          clearTimeout(debounceTimer)
          debounceTimer = setTimeout(() => {
            invalidateBoard()
            for (const id of pending) {
              void queryClient.invalidateQueries({
                queryKey: ['bead', project, id],
              })
            }
            pending.clear()
          }, FEED_DEBOUNCE_MS)
          break
        case 'disabled':
          setStatus('disabled')
          if (enableTried.current.has(project)) {
            setStatus('unsupported')
            setMessage('The bd events journal is still disabled')
            break
          }
          enableTried.current.add(project)
          enableEventsJournalFn({ data: { project } })
            .then(() => {
              if (!cancelled) {
                toast.success('Live updates enabled for this project')
                setAttempt((a) => a + 1)
              }
            })
            .catch((err) => {
              if (cancelled) return
              setStatus('unsupported')
              setMessage(
                toErrorMessage(err, 'Failed to enable the events journal'),
              )
            })
          break
        case 'unsupported':
          setStatus('unsupported')
          setMessage(msg.message)
          break
        case 'error':
          setStatus('error')
          setMessage(msg.message)
          clearTimeout(retryTimer)
          retryTimer = setTimeout(() => setAttempt((a) => a + 1), FEED_RETRY_MS)
          break
      }
    }

    const unsubscribe = subscribeBeadFeed(project, loadSeq(project), handle)
    return () => {
      cancelled = true
      unsubscribe()
      clearTimeout(debounceTimer)
      clearTimeout(retryTimer)
      pending.clear()
    }
  }, [project, attempt, queryClient])

  return { status, message }
}
