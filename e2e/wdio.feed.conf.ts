import { execFileSync } from 'node:child_process'
import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'

import { config as base } from './wdio.conf.ts'

/**
 * Live-updates e2e: drives the real desktop app against a throwaway bd
 * workspace. Everything (registry, beads store) lives in one temp dir so the
 * run never touches the developer's projects; wrappers that relocate
 * workspaces by repo name are pointed at that dir via BEADS_WORKSPACE_ROOT.
 *
 * wdio evaluates this file in the launcher AND in every worker. The launcher
 * creates the workspace and exports FEED_E2E_ROOT; workers (and the app they
 * attach to) reuse it instead of building a second one.
 */
const isLauncher = !process.env.FEED_E2E_ROOT
const root =
  process.env.FEED_E2E_ROOT ??
  fs.mkdtempSync(path.join(os.tmpdir(), 'bd-board-feed-e2e-'))
const home = path.join(root, 'home')
const ws = path.join(root, 'ws')

if (isLauncher) {
  fs.mkdirSync(path.join(home, '.config', 'bd-board'), { recursive: true })
  fs.mkdirSync(ws, { recursive: true })

  process.env.FEED_E2E_ROOT = root
  process.env.FEED_E2E_WS = ws
  process.env.BEADS_WORKSPACE_ROOT = path.join(root, 'beads-root')
  // GUI-launched apps lack the shell PATH; pin one bd binary for app and specs
  // so they agree on which workspace they see.
  process.env.BD_BIN ||= execFileSync('which', ['bd'], {
    encoding: 'utf8',
  }).trim()

  const bd = (...args: string[]) =>
    execFileSync(process.env.BD_BIN!, args, { cwd: ws, stdio: 'pipe' })

  execFileSync('git', ['init', '-q'], { cwd: ws })
  bd('init', '--non-interactive', '--quiet', '-p', 'feed')
  bd('create', '--title', 'seed', '--silent')
  fs.writeFileSync(
    path.join(home, '.config', 'bd-board', 'projects.json'),
    JSON.stringify({
      version: 1,
      projects: [{ id: 'feed', path: ws, label: 'feed' }],
    }),
  )
  // The app resolves its registry from HOME; set last so the setup above still
  // used the real one for git/bd.
  process.env.HOME = home
}

export const config: WebdriverIO.Config = {
  ...base,
  specs: ['./specs/feed/**/*.e2e.ts'],
  onComplete: () => {
    fs.rmSync(root, { recursive: true, force: true })
  },
}
