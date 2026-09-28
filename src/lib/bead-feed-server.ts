/* eslint-disable @typescript-eslint/no-unnecessary-condition */
import { spawn } from 'node:child_process'
import type { ChildProcess } from 'node:child_process'
import * as readline from 'node:readline'
import type { BeadFeedMessage } from './types.ts'
import { bdExec, bdErrorMessage, resolveDir } from './bd.ts'
import { parseProjectInput } from './server-validation.ts'

export const FEED_PAGE_SIZE = 1000
export const JOURNAL_DISABLED_MARKER = 'events journal is disabled'
export const TRUNCATED_CODE = 'events_journal_truncated'
export const FEED_HEARTBEAT_MS = 20_000

export function tailArgs(
  since: number,
  opts: { limit?: number; follow?: boolean },
): string[] {
  const args = ['events', 'tail', '--json', '--since', String(since)]
  if (opts.limit) {
    args.push('--limit', String(opts.limit))
  }
  if (opts.follow) {
    args.push('--follow')
  }
  return args
}

export function parseFeedLine(
  line: string,
):
  | { kind: 'record'; seq: number; issueIds: string[] }
  | { kind: 'truncated'; head: number }
  | null {
  const trimmed = line.trim()
  if (!trimmed) return null

  try {
    const obj = JSON.parse(trimmed) as Record<string, unknown>

    // Check for truncation error
    if (
      typeof obj.code === 'string' &&
      obj.code === TRUNCATED_CODE &&
      typeof obj.head === 'number'
    ) {
      return { kind: 'truncated', head: obj.head }
    }

    // Check for record
    if (typeof obj.seq === 'number' && typeof obj.op === 'string') {
      const issueIds: string[] = []

      // Add issue_id if it is a non-empty string
      if (typeof obj.issue_id === 'string' && obj.issue_id) {
        issueIds.push(obj.issue_id)
      }

      // Add dep.target if it is a non-empty string and differs from issue_id
      if (obj.dep && typeof obj.dep === 'object' && 'target' in obj.dep) {
        const target = (obj.dep as Record<string, unknown>).target
        if (typeof target === 'string' && target && target !== obj.issue_id) {
          issueIds.push(target)
        }
      }

      return { kind: 'record', seq: obj.seq, issueIds }
    }

    return null
  } catch {
    return null
  }
}

export async function drainJournal(
  exec: (
    args: string[],
  ) => Promise<{ code: number; stdout: string; stderr: string }>,
  since: number,
): Promise<
  | { kind: 'ready'; seq: number }
  | { kind: 'disabled' }
  | { kind: 'unsupported'; message: string }
> {
  let cur = since
  let checkedReset = false
  let first = true

  while (true) {
    const r = await exec(tailArgs(cur, { limit: FEED_PAGE_SIZE }))

    // Check for disabled journal on first run
    if (first && r.stderr.includes(JOURNAL_DISABLED_MARKER)) {
      return { kind: 'disabled' }
    }

    // Check for error
    if (r.code !== 0) {
      // Look for truncation in stdout
      for (const line of r.stdout.split('\n')) {
        const parsed = parseFeedLine(line)
        if (parsed && parsed.kind === 'truncated') {
          return { kind: 'ready', seq: parsed.head }
        }
      }

      // No truncation found, it's an unsupported command or error
      return {
        kind: 'unsupported',
        message: bdErrorMessage(r.stdout, r.stderr, r.code),
      }
    }
    // Parse records from stdout
    const records: { seq: number; issueIds: string[] }[] = []
    for (const line of r.stdout.split('\n')) {
      const parsed = parseFeedLine(line)
      if (parsed && parsed.kind === 'record') {
        records.push({ seq: parsed.seq, issueIds: parsed.issueIds })
      }
    }

    // Update cursor if we have records
    if (records.length > 0) {
      cur = records[records.length - 1].seq
    }

    // If we got a full page, continue draining
    if (records.length === FEED_PAGE_SIZE) {
      first = false
      continue
    }

    // We got less than a full page. Validate the checkpoint.
    if (first && records.length === 0 && cur > 0 && !checkedReset) {
      // Validate that the checkpoint is still valid
      const v = await exec(tailArgs(cur - 1, { limit: 1 }))

      let isValid = false
      if (v.code === 0) {
        // Check if the first record has seq === cur
        for (const line of v.stdout.split('\n')) {
          const parsed = parseFeedLine(line)
          if (parsed && parsed.kind === 'record' && parsed.seq === cur) {
            isValid = true
            break
          }
        }
      } else {
        // Check if there's a truncation with head >= cur
        for (const line of v.stdout.split('\n')) {
          const parsed = parseFeedLine(line)
          if (parsed && parsed.kind === 'truncated' && parsed.head >= cur) {
            isValid = true
            break
          }
        }
      }

      // If checkpoint is invalid, reset to 0
      if (!isValid) {
        cur = 0
        checkedReset = true
        first = true
        continue
      }
    }

    // Checkpoint is valid or we've already checked it
    return { kind: 'ready', seq: cur }
  }
}

export function startBeadFeed(
  projectId: string,
  since: number,
  emit: (msg: BeadFeedMessage) => void,
): () => void {
  let stopped = false
  let child: ChildProcess | null = null
  let bin = ''

  const stop = () => {
    stopped = true
    if (child) {
      child.kill('SIGTERM')
      child = null
    }
  }
  // Start the feed in an async IIFE
  ;(async () => {
    try {
      const dir = await resolveDir(projectId)

      // Drain the journal to find the current head
      const drainResult = await drainJournal(async (args) => {
        const result = await bdExec(dir, args)
        bin = result.bin
        return {
          code: result.code,
          stdout: result.stdout,
          stderr: result.stderr,
        }
      }, since)

      if (stopped) return

      if (drainResult.kind === 'disabled') {
        emit({ type: 'disabled' })
        return
      }

      if (drainResult.kind === 'unsupported') {
        emit({ type: 'unsupported', message: drainResult.message })
        return
      }

      // We're ready
      let cur = drainResult.seq
      if (!stopped) {
        emit({ type: 'live', seq: cur })
      }

      // Follow loop
      let truncated = false

      while (!stopped) {
        // Spawn the follow process
        child = spawn(bin, tailArgs(cur, { follow: true }), {
          cwd: dir,
          stdio: ['ignore', 'pipe', 'ignore'],
        })

        if (stopped) {
          child.kill('SIGTERM')
          return
        }

        const rl = readline.createInterface({
          input: child.stdout!,
          crlfDelay: Infinity,
        })

        let closeCode: number | null = null
        let closeSignal: string | null = null

        // Handle lines
        rl.on('line', (line) => {
          if (stopped) return

          const parsed = parseFeedLine(line)
          if (!parsed) return

          if (parsed.kind === 'record') {
            cur = parsed.seq
            if (!stopped) {
              emit({
                type: 'change',
                seq: parsed.seq,
                issueIds: parsed.issueIds,
              })
            }
          } else if (parsed.kind === 'truncated') {
            cur = parsed.head
            truncated = true
            if (!stopped) {
              emit({ type: 'change', seq: parsed.head, issueIds: [] })
            }
          }
        })

        // Wait for child to close
        await new Promise<void>((resolve) => {
          child!.on('close', (code, signal) => {
            closeCode = code
            closeSignal = signal
            rl.close()
            resolve()
          })

          child!.on('error', (err) => {
            if (!stopped) {
              emit({ type: 'error', message: err.message })
            }
            rl.close()
            resolve()
          })
        })

        if (stopped) return

        if (truncated) {
          // Reset and respawn
          truncated = false
          continue
        }

        // Unexpected close
        emit({
          type: 'error',
          message: `bd events tail exited (code ${closeCode}, signal ${closeSignal})`,
        })
        return
      }
    } catch (err) {
      if (!stopped) {
        const message = err instanceof Error ? err.message : String(err)
        emit({ type: 'unsupported', message })
      }
    }
  })()

  return stop
}

export async function beadFeedResponse(
  request: Request,
  project: string,
): Promise<Response> {
  // Validate project input
  let validProject: string
  try {
    validProject = parseProjectInput({ project }).project
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Invalid project'
    return new Response(message, { status: 400 })
  }

  // Parse since parameter
  const url = new URL(request.url)
  const sinceParam = url.searchParams.get('since')
  let since = 0
  if (sinceParam) {
    const num = Number(sinceParam)
    if (Number.isSafeInteger(num) && num >= 0) {
      since = num
    }
  }

  // Build the SSE response
  const encoder = new TextEncoder()
  let cleanup: () => void = () => {}

  const stream = new ReadableStream<Uint8Array>({
    start(controller) {
      let stopped = false
      let stopFeed: () => void = () => {}

      const heartbeat = setInterval(() => {
        try {
          controller.enqueue(encoder.encode(': hb\n\n'))
        } catch {
          cleanup()
        }
      }, FEED_HEARTBEAT_MS)

      cleanup = () => {
        if (stopped) return
        stopped = true
        clearInterval(heartbeat)
        stopFeed()
        request.signal.removeEventListener('abort', cleanup)
      }

      stopFeed = startBeadFeed(validProject, since, (msg) => {
        try {
          controller.enqueue(encoder.encode(`data: ${JSON.stringify(msg)}\n\n`))
        } catch {
          cleanup()
          return
        }
        if (
          msg.type === 'disabled' ||
          msg.type === 'unsupported' ||
          msg.type === 'error'
        ) {
          cleanup()
          try {
            controller.close()
          } catch {
            // already closed
          }
        }
      })

      if (request.signal.aborted) cleanup()
      else request.signal.addEventListener('abort', cleanup)
    },

    cancel() {
      cleanup()
    },
  })

  return new Response(stream, {
    headers: {
      'Content-Type': 'text/event-stream; charset=utf-8',
      'Cache-Control': 'no-cache, no-transform',
      Connection: 'keep-alive',
      'X-Accel-Buffering': 'no',
    },
  })
}
