import { execFileSync } from 'node:child_process'
import * as fs from 'node:fs'
import * as os from 'node:os'
import * as path from 'node:path'

const PROJECT = 'smoke'
const BD = process.env['BD_BIN'] || 'bd'

const root = fs.mkdtempSync(path.join(os.tmpdir(), 'bd-board-feed-smoke-'))
const home = path.join(root, 'home')
const ws = path.join(root, 'ws')

// Set environment before importing modules that depend on it
process.env['HOME'] = home
process.env['BD_BIN'] = BD
// Wrappers around bd may relocate workspaces by repo name; keep that inside the temp dir.
process.env['BEADS_WORKSPACE_ROOT'] = path.join(root, 'beads-root')

type BeadFeedMessage =
  | { type: 'live'; seq: number }
  | { type: 'change'; seq: number; issueIds: string[] }
  | { type: 'disabled' }
  | { type: 'unsupported'; message: string }
  | { type: 'error'; message: string }

function tailPids(): string[] {
  try {
    return execFileSync('pgrep', ['-f', 'events tail .*'], {
      encoding: 'utf8',
    })
      .split('\n')
      .filter(Boolean)
  } catch {
    return []
  }
}

async function waitFor<T>(
  what: string,
  ms: number,
  probe: () => T | undefined,
): Promise<T> {
  const deadline = Date.now() + ms
  while (Date.now() < deadline) {
    const v = probe()
    if (v !== undefined) return v
    await new Promise((r) => setTimeout(r, 100))
  }
  throw new Error(`timed out after ${ms}ms waiting for ${what}`)
}

async function main() {
  fs.mkdirSync(path.join(home, '.config', 'bd-board'), { recursive: true })
  fs.mkdirSync(ws)
  execFileSync('git', ['init', '-q'], { cwd: ws })
  execFileSync(BD, ['init', '--non-interactive', '--quiet', '-p', PROJECT], {
    cwd: ws,
    stdio: ['ignore', 'ignore', 'ignore'],
  })
  fs.writeFileSync(
    path.join(home, '.config', 'bd-board', 'projects.json'),
    JSON.stringify({
      version: 1,
      projects: [{ id: PROJECT, path: ws, label: PROJECT }],
    }),
  )

  const { startBeadFeed } =
    (await import('../src/lib/bead-feed-server.ts')) as {
      startBeadFeed: (
        projectId: string,
        since: number,
        emit: (msg: BeadFeedMessage) => void,
      ) => () => void
    }

  const before = tailPids().length

  // 1. journal off -> `disabled`
  console.log('Test 1: journal off -> disabled')
  {
    const msgs: BeadFeedMessage[] = []
    const stop = startBeadFeed(PROJECT, 0, (m) => msgs.push(m))
    try {
      const first = await waitFor(
        'first message (journal off)',
        10_000,
        () => msgs[0],
      )
      if (first.type !== 'disabled') {
        throw new Error(
          `expected disabled, got ${JSON.stringify(first, null, 2)}`,
        )
      }
      console.log('  ✓ journal off -> disabled')
    } finally {
      stop()
    }
  }

  // 2. journal on -> `live`, then `change` with the new id
  console.log('Test 2: journal on -> live and change on create')
  execFileSync(BD, ['config', 'set', 'events-journal', 'true'], {
    cwd: ws,
    stdio: ['ignore', 'ignore', 'ignore'],
  })
  {
    const msgs: BeadFeedMessage[] = []
    const stop = startBeadFeed(PROJECT, 0, (m) => msgs.push(m))
    try {
      const liveMsg = await waitFor('live message', 10_000, () =>
        msgs.find((m) => m.type === 'live'),
      )
      console.log(
        `  ✓ got live message (seq ${'seq' in liveMsg ? liveMsg.seq : '?'})`,
      )

      const idOutput = execFileSync(
        BD,
        ['create', '--title', 'feed smoke', '--silent'],
        {
          cwd: ws,
          encoding: 'utf8',
          stdio: ['ignore', 'pipe', 'ignore'],
        },
      ).trim()
      if (!idOutput) throw new Error('bd create printed no id')
      const id = idOutput

      const changeMsg = await waitFor(`change containing ${id}`, 10_000, () =>
        msgs.find((m) => m.type === 'change' && m.issueIds.includes(id)),
      )
      console.log(
        `  ✓ change received for ${id} (seq ${'seq' in changeMsg ? changeMsg.seq : '?'})`,
      )

      const bad = msgs.find(
        (m) => m.type === 'error' || m.type === 'unsupported',
      )
      if (bad) {
        throw new Error(`unexpected message ${JSON.stringify(bad, null, 2)}`)
      }
    } finally {
      stop()
    }
    await waitFor('bd events tail child to exit', 5_000, () =>
      tailPids().length <= before ? true : undefined,
    )
    console.log('  ✓ no bd events tail child left after stop')
  }
}

let code = 0
try {
  await main()
  console.log('\n✓ feed smoke passed')
} catch (err) {
  console.error(
    `\n✗ feed smoke FAILED: ${err instanceof Error ? err.message : String(err)}`,
  )
  if (err instanceof Error && err.stack) {
    console.error(err.stack)
  }
  code = 1
} finally {
  fs.rmSync(root, { recursive: true, force: true })
}
process.exit(code)
