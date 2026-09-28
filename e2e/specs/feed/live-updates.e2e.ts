import { execFileSync } from 'node:child_process'

import { resetApp } from '../../helpers.js'

const LIVE_TITLE = 'Live updates from the bd events journal'
const BD = process.env.BD_BIN || 'bd'
const WS = process.env.FEED_E2E_WS!

function tailProcesses(): number {
  try {
    const out = execFileSync('pgrep', ['-f', 'events tail .*--follow'], {
      encoding: 'utf8',
    })
    return out.split('\n').filter(Boolean).length
  } catch {
    return 0
  }
}

async function waitLive(): Promise<void> {
  await browser.waitUntil(
    async () =>
      browser.execute(
        (title: string) =>
          Boolean(document.querySelector(`[title="${title}"]`)),
        LIVE_TITLE,
      ),
    { timeout: 20000, timeoutMsg: 'board never reached Live' },
  )
}

describe('live updates (real bd)', () => {
  before(() => {
    expect(tailProcesses()).toBe(0)
  })

  it('auto-enables the journal and reaches Live', async () => {
    await resetApp('/p/feed')
    await waitLive()
    expect(
      execFileSync(BD, ['config', 'get', 'events-journal'], {
        cwd: WS,
        encoding: 'utf8',
      }).trim(),
    ).toBe('true')
    expect(tailProcesses()).toBe(1)
  })

  it('shows a bead created from the CLI within 5 s', async () => {
    execFileSync(BD, ['create', '--title', 'from cli', '--silent'], {
      cwd: WS,
    })
    await browser.waitUntil(
      async () =>
        browser.execute(() => document.body.innerText.includes('from cli')),
      { timeout: 5000, timeoutMsg: 'card did not appear via the feed' },
    )
  })

  it('does not leak follow processes across a webview reload', async () => {
    await browser.execute(() => window.location.reload())
    await browser.pause(1500)
    await waitLive()
    await browser.pause(1500)
    expect(tailProcesses()).toBe(1)
  })
})
