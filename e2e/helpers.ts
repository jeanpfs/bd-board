const SIDEBAR_KEY = 'bdb.sidebar-collapsed.v1'

/**
 * Every spec starts from a known window state: localStorage wiped and a fresh
 * document load.
 *
 * Navigation stays inside the page. Driving `browser.url()` against the
 * `tauri://` origin wedges the embedded driver's window-state polling, and the
 * app bundle re-initializes `@wdio/tauri-plugin` on every load anyway — so
 * mocks registered after this call are still intercepted.
 */
export async function resetApp(path = '/'): Promise<void> {
  await browser.execute(
    (key: string, target: string) => {
      window.localStorage.removeItem(key)
      window.location.replace(target)
    },
    SIDEBAR_KEY,
    path,
  )

  await browser.waitUntil(
    async () => {
      const ready = await browser.execute(
        (target: string) =>
          document.readyState === 'complete' &&
          window.location.pathname === target &&
          Boolean(document.querySelector('aside button[aria-label]')),
        path,
      )
      return ready === true
    },
    {
      timeout: 20000,
      timeoutMsg: `app did not settle on ${path}`,
    },
  )
}

export async function sidebarWidth(): Promise<number> {
  return browser.execute(() => {
    const aside = document.querySelector('aside')
    return aside ? Math.round(aside.getBoundingClientRect().width) : -1
  })
}

export async function storedCollapsed(): Promise<string | null> {
  return browser.execute(
    (key: string) => window.localStorage.getItem(key),
    SIDEBAR_KEY,
  )
}

export async function waitForSidebarWidth(expected: number): Promise<void> {
  await browser.waitUntil(async () => (await sidebarWidth()) === expected, {
    timeout: 10000,
    timeoutMsg: `sidebar never reached ${expected}px`,
  })
}

/**
 * The projects query is served by the `list_projects` IPC command. Mocks only
 * take effect on the next fetch, and TanStack Query refetches on window focus,
 * so a synthetic focus event is the cheapest deterministic trigger.
 */
export async function refetchQueries(): Promise<void> {
  await browser.execute(() => {
    window.dispatchEvent(new Event('focus'))
    document.dispatchEvent(new Event('visibilitychange'))
  })
}

/** Polls with repeated refetch triggers until the rail shows the given titles. */
export async function waitForProjectRows(expected: string[]): Promise<void> {
  await browser.waitUntil(
    async () => {
      await refetchQueries()
      const titles = await browser.execute(() =>
        [...document.querySelectorAll('nav[aria-label="Projects"] li a')].map(
          (a) => a.getAttribute('title') ?? (a as HTMLElement).innerText.trim(),
        ),
      )
      return (
        titles.length === expected.length &&
        expected.every((t, i) => titles[i]?.startsWith(t))
      )
    },
    {
      timeout: 20000,
      interval: 1000,
      timeoutMsg: 'project rows never matched',
    },
  )
}

export function fakeProject(id: string, name: string) {
  return {
    id,
    name,
    dir: `/tmp/${id}`,
    beadsPath: `/tmp/beads/${id}/.beads`,
    prefix: id,
    external: true,
    missing: false,
    error: null,
    counts: {
      open: 2,
      in_progress: 1,
      blocked: 0,
      closed: 3,
      deferred: 0,
      total: 6,
    },
  }
}

const DEV_SERVER_URL = process.env.E2E_DEV_SERVER_URL ?? 'http://localhost:3009'

/**
 * Browser-mode reset.
 *
 * The service stubs `window.__TAURI_INTERNALS__` so mocks work, but never sets
 * `window.isTauri`, which is what `isDesktopApp()` checks — without the init
 * script the app takes its web/server-function path and never issues the IPC
 * calls under test.
 *
 * `setupMocks` runs between two loads on purpose: mocks registered on the first
 * page are restored by the service after the second navigation, so they are in
 * place before the app fires its startup queries.
 */
export async function resetBrowserApp(
  path = '/',
  responses: Record<string, unknown> = {},
): Promise<void> {
  await browser.addInitScript(() => {
    ;(window as unknown as Record<string, unknown>).isTauri = true
    window.localStorage.removeItem('bdb.sidebar-collapsed.v1')
  })
  await seedIpcMocks(responses)

  await browser.url(`${DEV_SERVER_URL}${path}`)
  await $('aside button[aria-label]').waitForExist({ timeout: 20000 })
}

export interface IpcCall {
  cmd: string
  args: unknown
}

/**
 * Seeds the mock table before the app boots.
 *
 * `browser.tauri.mock()` can only register once a page exists, which is too late
 * for commands the app fires during startup (`list_projects`, `desktop_probe`),
 * and the service does not carry mocks across a navigation. This installs the
 * same `window.__wdio_mocks__` entries the service's IPC interceptor reads, via
 * an init script, and records every intercepted call for assertions.
 *
 * The table is installed behind an accessor so it survives the service's own
 * preload assigning to `window.__wdio_mocks__`.
 */
export async function seedIpcMocks(
  responses: Record<string, unknown>,
): Promise<void> {
  await browser.addInitScript((payload: string) => {
    const w = window as unknown as Record<string, unknown>
    const table: Record<string, (args?: unknown) => unknown> = {}
    const calls: IpcCall[] = []
    w.__ipcCalls__ = calls

    for (const [cmd, value] of Object.entries(
      JSON.parse(payload) as Record<string, unknown>,
    )) {
      table[cmd] = (args?: unknown) => {
        calls.push({ cmd, args })
        return value
      }
    }

    Object.defineProperty(w, '__wdio_mocks__', {
      get: () => table,
      set: (next: Record<string, (args?: unknown) => unknown>) => {
        Object.assign(table, next)
      },
      configurable: true,
    })
  }, JSON.stringify(responses))
}

export async function ipcCalls(cmd?: string): Promise<IpcCall[]> {
  const calls = await browser.execute(
    () =>
      ((window as unknown as Record<string, unknown>).__ipcCalls__ ??
        []) as IpcCall[],
  )
  return cmd ? calls.filter((call) => call.cmd === cmd) : calls
}
