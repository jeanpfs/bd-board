import { fakeProject, resetBrowserApp } from '../../helpers.js'

describe('project header', () => {
  beforeEach(async () => {
    await resetBrowserApp('/p/tako?tab=board', {
      list_projects: [fakeProject('tako', 'tako')],
      list_beads: [],
      desktop_probe: null,
    })
    await $('header nav[aria-label="Breadcrumb"]').waitForExist({
      timeout: 20000,
    })
  })

  it('shows the project and the current view as a breadcrumb', async () => {
    const crumb = await browser.execute(() => {
      const nav = document.querySelector('header nav[aria-label="Breadcrumb"]')
      return {
        project: nav?.querySelector('a > span:last-child')?.textContent,
        current: nav?.querySelector('[aria-current="page"]')?.textContent,
        tablist: document.querySelector('header [role="tablist"]') !== null,
      }
    })

    expect(crumb).toEqual({
      project: 'tako',
      current: 'Board',
      tablist: false,
    })
  })

  it('the project crumb goes back to the Overview, which has no topbar', async () => {
    await $('header nav[aria-label="Breadcrumb"] a').click()
    await browser.waitUntil(
      async () => (await browser.getUrl()).includes('tab=overview'),
      { timeout: 5000, timeoutMsg: 'navigation to the overview failed' },
    )
    await expect($('h1=tako')).toBeDisplayed()
    expect(await $$('header nav[aria-label="Breadcrumb"]')).toHaveLength(0)
  })

  it('no longer renders the runtime label in the sidebar', async () => {
    const railText = await browser.execute(
      () => document.querySelector('aside')?.innerText ?? '',
    )

    expect(railText).not.toContain('desktop')
    expect(railText).not.toContain('web')
  })
})
describe('first run without projects', () => {
  beforeEach(async () => {
    await resetBrowserApp('/', {
      list_projects: [],
      list_beads: [],
      desktop_probe: null,
    })
  })

  it('shows only the start screen: no sidebar, no project header', async () => {
    await expect($('h1=Start with a project')).toBeDisplayed()
    const chrome = await browser.execute(() => ({
      sidebar: document.querySelector('aside') !== null,
      breadcrumb:
        document.querySelector('header nav[aria-label="Breadcrumb"]') !== null,
    }))
    expect(chrome).toEqual({ sidebar: false, breadcrumb: false })
  })
})

describe('home page header with project navigation', () => {
  beforeEach(async () => {
    await resetBrowserApp('/', {
      list_projects: [fakeProject('tako', 'tako')],
      list_beads: [],
      desktop_probe: null,
      check_project_path: { kind: 'valid', external: true },
    })
    await $('nav[aria-label="Projects"] li a').waitForExist({ timeout: 20000 })
  })

  it('survives SPA navigation home ↔ project without Rules of Hooks violations', async () => {
    // Initialize error capture to detect Rules of Hooks violations
    await browser.execute(() => {
      const errors: string[] = []
      window.addEventListener('error', (e) => {
        errors.push(`[error] ${e.message}`)
      })
      window.addEventListener('unhandledrejection', (e) => {
        errors.push(`[unhandledrejection] ${String(e.reason)}`)
      })
      ;(window as unknown as Record<string, unknown>).__capturedErrors = errors
    })

    const hasBreadcrumb = () =>
      browser.execute(
        () =>
          document.querySelector('header nav[aria-label="Breadcrumb"]') !==
          null,
      )

    // On home there is no project topbar
    expect(await hasBreadcrumb()).toBe(false)

    // Navigate to the project: it opens on the Overview
    await $('nav[aria-label="Projects"] li a').click()
    await browser.waitUntil(
      async () => (await browser.getUrl()).includes('/p/') === true,
      { timeout: 5000, timeoutMsg: 'navigation to project failed' },
    )
    await expect($('h1=tako')).toBeDisplayed()

    // Switch to the board: the topbar shows the breadcrumb
    await $('nav[aria-label="Project"]').$('a*=Board').click()
    await browser.waitUntil(hasBreadcrumb, {
      timeout: 5000,
      timeoutMsg: 'ProjectTopbar did not render',
    })

    // Navigate back to home via Home link
    await $('nav[aria-label="Home"] a').click()
    await browser.waitUntil(
      async () => (await browser.getUrl()).endsWith('/') === true,
      { timeout: 5000, timeoutMsg: 'navigation to home failed' },
    )

    // Back on home, ProjectTopbar is gone
    expect(await hasBreadcrumb()).toBe(false)

    // Verify: no Rules of Hooks or other critical errors captured
    const errors = await browser.execute(
      () =>
        (window as unknown as Record<string, unknown>)
          .__capturedErrors as string[],
    )
    expect(errors).toHaveLength(0)
  })
})
