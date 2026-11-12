// Records the bd-board demo from a real Chrome window on a macOS virtual display, in native HiDPI pixels.
//
// Setup (macOS):
// 1. A 1440x810 HiDPI virtual screen named "bdboard-demo" (BetterDisplay, `brew install --cask betterdisplay`).
//    It renders at 2880x1620 pixels, so the UI reads at a comfortable size and stays sharp at 1080p:
//      betterdisplaycli create --type=VirtualScreen --virtualScreenName=bdboard-demo --aspectWidth=16 --aspectHeight=9 --virtualScreenHiDPI=on
//      betterdisplaycli set --name=bdboard-demo --connected=on
//      betterdisplaycli set --name=bdboard-demo --resolution=1440x810 --hiDPI=on
//    The terminal running this script needs Screen Recording permission.
// 2. Run seed.sh and start `pnpm dev` against the seeded projects (see seed.sh). Seed again before every take:
//    the scenario creates a bead.
// 3. Install Playwright in a scratch directory (`npm i playwright`), run `node record.mjs` from there, then build
//    the README video with make-video.sh.
// The dev server listens on IPv6 only, hence the [::1] address; DEMO_BASE overrides it (another port).
// DEMO_SCREEN picks another virtual screen by name.
import { chromium } from 'playwright'
import { execFileSync, spawn } from 'node:child_process'
import { mkdirSync, mkdtempSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'

const BASE = process.env.DEMO_BASE ?? 'http://[::1]:3009'
const SCREEN = process.env.DEMO_SCREEN ?? 'bdboard-demo'
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
const RAW = `${OUT}/screen.mov`
rmSync(OUT, { recursive: true, force: true })
mkdirSync(OUT, { recursive: true })

// Where the virtual screen sits: its index among NSScreen.screens and its top-left corner in global
// coordinates (Cocoa frames start at the bottom-left of the main screen, Chrome positions from the top-left).
function findScreen(name) {
  const script = `ObjC.import("AppKit");
    const all = $.NSScreen.screens, mainH = all.objectAtIndex(0).frame.size.height;
    const out = [];
    for (let i = 0; i < all.count; i++) {
      const s = all.objectAtIndex(i), f = s.frame;
      out.push({ index: i, name: ObjC.unwrap(s.localizedName), x: f.origin.x,
        y: mainH - (f.origin.y + f.size.height), width: f.size.width, height: f.size.height });
    }
    JSON.stringify(out)`
  const screens = JSON.parse(
    execFileSync('osascript', ['-l', 'JavaScript', '-e', script], {
      encoding: 'utf8',
    }),
  )
  const screen = screens.find((s) => s.name === name)
  if (!screen)
    throw new Error(
      `no screen named ${name}; found: ${screens.map((s) => s.name).join(', ')}`,
    )
  return screen
}

// ffmpeg's avfoundation device index for "Capture screen N".
function captureDevice(screenIndex) {
  let listing = ''
  try {
    execFileSync(
      'ffmpeg',
      ['-f', 'avfoundation', '-list_devices', 'true', '-i', ''],
      { stdio: 'pipe' },
    )
  } catch (error) {
    listing = String(error.stderr)
  }
  const match = listing.match(
    new RegExp(`\\[(\\d+)\\] Capture screen ${screenIndex}\\b`),
  )
  if (!match) throw new Error(`ffmpeg lists no "Capture screen ${screenIndex}"`)
  return match[1]
}

const screen = findScreen(SCREEN)
const device = captureDevice(screen.index)
console.log(
  `recording ${SCREEN} (${screen.width}x${screen.height} pt) as capture device ${device}`,
)

// A real Chrome window, full screen on the virtual display, without browser UI or the automation banner.
const profile = mkdtempSync(join(tmpdir(), 'bdboard-demo-chrome-'))
const ctx = await chromium.launchPersistentContext(profile, {
  channel: 'chrome',
  headless: false,
  viewport: null,
  colorScheme: 'dark',
  ignoreDefaultArgs: ['--enable-automation'],
  args: [
    `--app=${BASE}/`,
    `--window-position=${screen.x},${screen.y}`,
    `--window-size=${screen.width},${screen.height}`,
    '--kiosk',
  ],
})
await ctx.addInitScript(() => {
  // The pointer is drawn by the page: Playwright moves a virtual mouse, not the macOS cursor.
  window.addEventListener('DOMContentLoaded', () => {
    const d = document.createElement('div')
    d.innerHTML =
      '<svg width="22" height="30" viewBox="0 0 22 30"><path d="M2 2 L2 23 L7.5 17.8 L11.2 26.5 L14.6 25 L10.9 16.6 L18.5 16.6 Z" fill="#000" stroke="#fff" stroke-width="1.6" stroke-linejoin="round"/></svg>'
    d.style.cssText =
      'position:fixed;z-index:2147483647;left:-60px;top:-60px;pointer-events:none;filter:drop-shadow(0 2px 3px #0009);transform-origin:2px 2px;transition:transform .08s'
    document.documentElement.appendChild(d)
    const move = (e) => {
      d.style.left = e.clientX - 2 + 'px'
      d.style.top = e.clientY - 2 + 'px'
    }
    window.addEventListener('mousemove', move, true)
    window.addEventListener(
      'mousedown',
      () => (d.style.transform = 'scale(.88)'),
      true,
    )
    window.addEventListener('mouseup', () => (d.style.transform = ''), true)
  })
})
const page = ctx.pages()[0] ?? (await ctx.newPage())
page.on('pageerror', (e) => console.log('pageerror', e.message))
const wait = (ms) => page.waitForTimeout(ms)

async function glide(x, y, steps = 18) {
  await page.mouse.move(x, y, { steps })
}
async function center(loc) {
  const b = await loc.boundingBox()
  return { x: b.x + b.width / 2, y: b.y + b.height / 2 }
}

async function clickGlide(loc, pause = 250) {
  const p = await center(loc)
  await glide(p.x, p.y)
  await wait(pause)
  await loc.click()
}

// Load and settle (kiosk full-screen animation, first compile) before the camera rolls.
await page.goto(BASE + '/', { waitUntil: 'networkidle' })
await page.locator('html[data-hydrated]').waitFor()
await glide(screen.width / 2, screen.height / 2, 1)
await wait(2500)

// Near-lossless capture of the virtual display at 60 fps; the macOS cursor is left out.
const ffmpeg = spawn(
  'ffmpeg',
  [
    '-y',
    '-f',
    'avfoundation',
    '-capture_cursor',
    '0',
    '-framerate',
    '60',
    '-i',
    `${device}:none`,
    '-c:v',
    'libx264',
    '-preset',
    'ultrafast',
    '-crf',
    '8',
    '-pix_fmt',
    'yuv420p',
    RAW,
  ],
  { stdio: ['pipe', 'ignore', 'ignore'] },
)
await wait(1200)

// `q` lets ffmpeg finalize the file; killing it would leave the capture unreadable. A failing step must
// still stop the capture and close Chrome, or ffmpeg keeps recording after the script dies.
async function stopCapture() {
  if (ffmpeg.exitCode === null) {
    const stopped = new Promise((resolve) => ffmpeg.once('exit', resolve))
    ffmpeg.stdin.write('q')
    await stopped
  }
  await ctx.close().catch(() => {})
  rmSync(profile, { recursive: true, force: true })
}
process.once('uncaughtException', async (error) => {
  console.error(error)
  await stopCapture()
  process.exit(1)
})

// 1. Home: what needs me across every project
await glide(700, 420)
await wait(1800)

// 2. The ledger project opens on its Overview
await clickGlide(page.getByRole('link', { name: /ledger/ }).first())
await page.getByText('Needs attention').first().waitFor()
await wait(1700)

// 3. Board with epic swimlanes
await clickGlide(
  page
    .locator('nav[aria-label="Project"]')
    .getByRole('link', { name: 'Board' }),
)
await page
  .getByText('Duplicate payment webhook creates two receipts')
  .first()
  .waitFor()
await wait(1300)

// 4. Command palette: find a bead by title and open it
await page.keyboard.press('Meta+k')
await page.getByPlaceholder(/Search beads/).waitFor()
await wait(300)
await page.keyboard.type('webhook', { delay: 110 })
await wait(500)
await page.keyboard.press('Enter')
// The detail title shows at once; comments load in the background.
await page
  .getByRole('dialog')
  .getByText('Duplicate payment webhook creates two receipts')
  .waitFor()
await wait(2400)
// Close the detail with its X; Escape can land on a focused control instead.
await clickGlide(
  page.getByRole('dialog').getByRole('button', { name: 'Close' }).first(),
)
await page.getByRole('dialog').waitFor({ state: 'hidden' })
await wait(600)

// 5. Drag a card from Open to In progress (the grip handle appears on hover)
const dragTitle = 'Rate-limit the public invoice link'
const cardBox = page.locator(
  'xpath=//span[normalize-space(.)="' +
    dragTitle +
    '"]/ancestor::*[contains(@class,"group/card")][1]',
)
const cb = await cardBox.boundingBox()
await glide(cb.x + cb.width / 2, cb.y + cb.height / 2)
await wait(500)
const hb = await cardBox.locator('button.cursor-grab').boundingBox()
const hx = hb.x + hb.width / 2,
  hy = hb.y + hb.height / 2
const to = await page
  .getByText('In progress', { exact: true })
  .first()
  .boundingBox()
await glide(hx, hy, 8)
await wait(350)
await page.mouse.down()
await glide(hx + 24, hy + 14, 6)
// The drop column is the one under the pointer; pause over it so its highlight shows.
await glide(to.x + to.width / 2, hy + 30, 48)
await wait(500)
await page.mouse.up()
await wait(1500)

// 6. A bead created from the terminal shows up live (bd events journal). A terminal panel types the command
// first, so the new card has a visible cause.
const command = 'bd create "Fix flaky invoice export test" -t bug -p 1 -a sam'
await page.evaluate(() => {
  const panel = document.createElement('div')
  panel.id = 'demo-terminal'
  panel.innerHTML =
    '<div style="display:flex;gap:6px;padding:9px 12px;border-bottom:1px solid #ffffff14">' +
    '<span style="width:10px;height:10px;border-radius:50%;background:#ff5f57"></span>' +
    '<span style="width:10px;height:10px;border-radius:50%;background:#febc2e"></span>' +
    '<span style="width:10px;height:10px;border-radius:50%;background:#28c840"></span></div>' +
    '<pre style="margin:0;padding:12px 14px;white-space:pre-wrap"><span style="color:#7ee787">~/ledger $</span> <span id="demo-terminal-text"></span><span style="opacity:.7">▍</span></pre>'
  panel.style.cssText =
    'position:fixed;right:32px;bottom:56px;z-index:2147483646;width:680px;border-radius:10px;background:#0b0d10f2;color:#e6edf3;font:14px/1.5 ui-monospace,SFMono-Regular,Menlo,monospace;box-shadow:0 18px 50px #000a;border:1px solid #ffffff1f;opacity:0;transform:translateY(8px);transition:opacity .25s,transform .25s'
  document.body.appendChild(panel)
  requestAnimationFrame(() => {
    panel.style.opacity = '1'
    panel.style.transform = 'none'
  })
})
await wait(400)
for (const ch of command) {
  await page.evaluate((c) => {
    document.getElementById('demo-terminal-text').textContent += c
  }, ch)
  await wait(28)
}
await wait(300)
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
const arrived = page.getByText('Fix flaky invoice export test').first()
await arrived.waitFor({ timeout: 15000 })
await wait(500)
const ap = await center(arrived)
await glide(ap.x, ap.y, 24)
await wait(2200)
await page.evaluate(() => document.getElementById('demo-terminal')?.remove())
await wait(400)

// 7. Agents: claims, heartbeats and leases
await clickGlide(
  page
    .locator('nav[aria-label="Project"]')
    .getByRole('link', { name: 'Agents' }),
)
await page.locator('main').getByText('claude-code').first().waitFor()
await wait(2200)

// 8. Epics timeline
await clickGlide(
  page
    .locator('nav[aria-label="Project"]')
    .getByRole('link', { name: 'Board' }),
)
await clickGlide(page.getByRole('radio', { name: 'Timeline' }))
await page.getByText('Recurring invoices').first().waitFor()
await wait(2400)

await stopCapture()
console.log('recorded', RAW)
