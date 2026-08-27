import { fakeProject, resetBrowserApp } from '../../helpers.js'

describe('project header', () => {
  beforeEach(async () => {
    await resetBrowserApp('/p/tako', {
      list_projects: [fakeProject('tako', 'tako')],
      list_beads: [],
      desktop_probe: null,
    })
    await $('nav[aria-label="Projects"] li a').waitForExist({ timeout: 20000 })
  })

  it('shows only the current project name, capitalized and bold', async () => {
    const header = await browser.execute(() => {
      const el = document.querySelector('header')
      const label = el?.querySelector('span')
      const style = label ? getComputedStyle(label) : null
      return {
        breadcrumbLinks: [...(el?.querySelectorAll('a') ?? [])]
          .map((a) => (a as HTMLElement).innerText.trim())
          .filter((text) => text === 'Projects'),
        separators: (el?.innerText ?? '').includes('/'),
        rendered: (label as HTMLElement | null)?.innerText.trim(),
        source: label
          ? label.textContent
            ? label.textContent.trim()
            : undefined
          : null,
        textTransform: style?.textTransform,
        fontWeight: Number(style?.fontWeight ?? 0),
      }
    })

    expect(header.breadcrumbLinks).toHaveLength(0)
    expect(header.separators).toBe(false)
    expect(header.rendered).toBe('Tako')
    expect(header.source).toBe('tako')
    expect(header.textTransform).toBe('capitalize')
    expect(header.fontWeight).toBeGreaterThanOrEqual(600)
  })

  it('no longer renders the runtime label in the sidebar', async () => {
    const railText = await browser.execute(
      () => document.querySelector('aside')?.innerText ?? '',
    )

    expect(railText).not.toContain('desktop')
    expect(railText).not.toContain('web')
  })
})
describe('home page header', () => {
  beforeEach(async () => {
    await resetBrowserApp('/', {
      list_projects: [],
      list_beads: [],
      desktop_probe: null,
    })
    await $('nav[aria-label="Projects"]').waitForExist({ timeout: 20000 })
  })

  it('does not render ProjectTopbar when no project is active', async () => {
    // Verify ProjectTopbar does not exist: no header with tablist role.
    // (Note: page still has a <header> from PageHeader with project list, but no tablist)
    const hasProjectTopbar = await browser.execute(
      () => document.querySelector('header [role="tablist"]') !== null,
    )
    expect(hasProjectTopbar).toBe(false)
  })
})

describe('home page header with project navigation', () => {
  beforeEach(async () => {
    await resetBrowserApp('/', {
      list_projects: [fakeProject('tako', 'tako')],
      list_beads: [],
      desktop_probe: null,
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

    // Verify: on home, ProjectTopbar does not exist (no header with tablist role)
    let hasProjectTopbar = await browser.execute(
      () => document.querySelector('header [role="tablist"]') !== null,
    )
    expect(hasProjectTopbar).toBe(false)

    // Navigate to project
    await $('nav[aria-label="Projects"] li a').click()
    await browser.waitUntil(
      async () => (await browser.getUrl()).includes('/p/') === true,
      { timeout: 5000, timeoutMsg: 'navigation to project failed' },
    )

    // Verify: in project, ProjectTopbar exists and shows project name
    hasProjectTopbar = await browser.execute(
      () => document.querySelector('header [role="tablist"]') !== null,
    )
    expect(hasProjectTopbar).toBe(true)

    const projectName = await browser.execute(() => {
      const header = document.querySelector('header')
      const span = header?.querySelector('span')
      return span?.textContent.trim()
    })
    expect(projectName).toBe('tako')

    // Navigate back to home via Home link
    await $('nav[aria-label="Home"] a').click()
    await browser.waitUntil(
      async () => (await browser.getUrl()).endsWith('/') === true,
      { timeout: 5000, timeoutMsg: 'navigation to home failed' },
    )

    // Verify: back on home, ProjectTopbar is gone
    hasProjectTopbar = await browser.execute(
      () => document.querySelector('header [role="tablist"]') !== null,
    )
    expect(hasProjectTopbar).toBe(false)

    // Verify: no Rules of Hooks or other critical errors captured
    const errors = await browser.execute(
      () =>
        (window as unknown as Record<string, unknown>)
          .__capturedErrors as string[],
    )
    expect(errors).toHaveLength(0)
  })
})
