// Records the bd-board demo (session.webm) with Playwright and the installed Chrome.
//
// Setup: run seed.sh, start `pnpm dev` against the seeded projects (see seed.sh), and install Playwright in a
// scratch directory (`npm i playwright`; `npx playwright install ffmpeg` for the video encoder). Seed again before
// every take: the scenario creates a bead. Then run `node record.mjs` from that directory and build the GIF with
// make-gif.sh. The dev server listens on IPv6 only, hence the [::1] address.
import { chromium } from 'playwright'
import { execFileSync } from 'node:child_process'
import { mkdirSync, rmSync, readdirSync, renameSync } from 'node:fs'

const BASE = 'http://[::1]:3009'
const ENV = {
  ...process.env,
  HOME: '/private/tmp/bdb-home',
  BEADS_WORKSPACE_ROOT: '/private/tmp/bdb-ws',
  BEADS_ACTOR: 'maya',
  PATH: `/private/tmp/bdb-home/.local/bin:${process.env.PATH}`,
}
const bd = (args) =>
  execFileSync('bd', args, {
    cwd: '/private/tmp/bdb-demo/ledger',
    env: ENV,
    encoding: 'utf8',
  })
const OUT = '/private/tmp/pw/video'
rmSync(OUT, { recursive: true, force: true })
mkdirSync(OUT, { recursive: true })

const browser = await chromium.launch({ channel: 'chrome', headless: true })
const ctx = await browser.newContext({
  viewport: { width: 1440, height: 900 },
  colorScheme: 'dark',
  recordVideo: { dir: OUT, size: { width: 1440, height: 900 } },
})
await ctx.addInitScript(() => {
  // Visible cursor: Playwright videos do not draw the pointer.
  window.addEventListener('DOMContentLoaded', () => {
    const d = document.createElement('div')
    d.style.cssText =
      'position:fixed;z-index:2147483647;width:18px;height:18px;border-radius:50%;background:rgba(255,255,255,.85);border:2px solid #2563eb;box-shadow:0 2px 8px #0008;pointer-events:none;transform:translate(-50%,-50%);left:-50px;top:-50px;transition:transform .08s'
    document.documentElement.appendChild(d)
    window.addEventListener(
      'mousemove',
      (e) => {
        d.style.left = e.clientX + 'px'
        d.style.top = e.clientY + 'px'
      },
      true,
    )
    window.addEventListener(
      'mousedown',
      () => {
        d.style.transform = 'translate(-50%,-50%) scale(.75)'
      },
      true,
    )
    window.addEventListener(
      'mouseup',
      () => {
        d.style.transform = 'translate(-50%,-50%)'
      },
      true,
    )
  })
})
const page = await ctx.newPage()
page.on('pageerror', (e) => console.log('pageerror', e.message))
const wait = (ms) => page.waitForTimeout(ms)

async function glide(x, y, steps = 18) {
  await page.mouse.move(x, y, { steps })
}
async function center(loc) {
  const b = await loc.boundingBox()
  return { x: b.x + b.width / 2, y: b.y + b.height / 2 }
}

// 1. Dashboard
await page.goto(BASE + '/', { waitUntil: 'networkidle' })
await glide(700, 500)
await wait(1800)

// 2. Open the ledger project board
const ledger = page.getByRole('link', { name: /ledger/ }).first()
const lp = await center(ledger)
await glide(lp.x, lp.y)
await wait(250)
await ledger.click()
await page
  .getByText('Duplicate payment webhook creates two receipts')
  .first()
  .waitFor()
await wait(2200)

// 3. Open a bead: description, comments, status
const bug = page
  .getByText('Duplicate payment webhook creates two receipts')
  .first()
const bp = await center(bug)
await glide(bp.x, bp.y)
await wait(250)
await bug.click()
await page.getByText('Fix plan: store the event id').waitFor()
await wait(2800)
await page.keyboard.press('Escape')
await wait(700)

// 4. Drag a card from Open to In progress (the grip handle appears on hover)
const dragTitle = 'Rate-limit the public invoice link'
const cardBox = page.locator(
  'xpath=//span[normalize-space(.)="' +
    dragTitle +
    '"]/ancestor::*[contains(@class,"group/card")][1]',
)
const cb = await cardBox.boundingBox()
await glide(cb.x + cb.width / 2, cb.y + cb.height / 2)
await wait(500)
const handle = cardBox.locator('button.cursor-grab')
const hb = await handle.boundingBox()
const hx = hb.x + hb.width / 2,
  hy = hb.y + hb.height / 2
await glide(hx, hy, 8)
await wait(350)
await page.mouse.down()
await glide(hx + 24, hy + 14, 5)
await glide(700, 345, 26)
await wait(450)
await page.mouse.up()
await wait(2200)

// 5. A change made outside the UI shows up live (bd events journal)
await glide(1000, 800, 14)
bd([
  'create',
  'Fix flaky invoice export test',
  '-t',
  'bug',
  '-p',
  '1',
  '-a',
  'sam',
  '-l',
  'bug',
  '--silent',
])
await wait(3200)

// 6. Search
const search = page.getByPlaceholder(/Search/)
const sp = await center(search)
await glide(sp.x, sp.y)
await wait(250)
await search.click()
await page.keyboard.type('pdf', { delay: 140 })
await wait(2200)

await ctx.close()
await browser.close()
const f = readdirSync(OUT).find((n) => n.endsWith('.webm'))
renameSync(`${OUT}/${f}`, `${OUT}/session.webm`)
console.log('recorded', `${OUT}/session.webm`)
