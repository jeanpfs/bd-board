import { fakeProject, resetBrowserApp } from '../../helpers.js'

describe('beads query prefetch on hover', () => {
  const testProject = fakeProject('prefetch-test', 'Prefetch Test')

  beforeEach(async () => {
    await resetBrowserApp('/', {
      list_projects: [testProject],
      list_beads: [
        {
          id: 'bead-1',
          project: testProject.id,
          title: 'Test bead',
          status: 'open',
          assignee: null,
        },
      ],
      desktop_probe: null,
    })
    await $('nav[aria-label="Projects"] li a').waitForExist({ timeout: 20000 })
  })

  it('prefetches beads query when hovering over project card', async () => {
    const projectLink = await $('a[href="/p/prefetch-test"]')
    await projectLink.moveTo()

    // Wait for prefetch by polling the cache directly
    await browser.waitUntil(
      async () => {
        const state = await browser.execute(
          () =>
            (window as any).__TSR_ROUTER__?.options?.context?.queryClient?.getQueryState(
              ['beads', 'prefetch-test'],
            ),
        )
        return state?.status === 'success'
      },
      { timeout: 3000, timeoutMsg: 'prefetch never populated the cache' },
    )

    // Proof: cache already has data BEFORE click
    const cachedBeforeClick = await browser.execute(
      () =>
        (window as any).__TSR_ROUTER__?.options?.context?.queryClient?.getQueryState(
          ['beads', 'prefetch-test'],
        )?.status,
    )
    expect(cachedBeforeClick).toBe('success')

    await projectLink.click()
    await browser.waitUntil(
      () => browser.execute(() => window.location.pathname === '/p/prefetch-test'),
      { timeout: 10000 },
    )
  })

  it('prefetches beads query when hovering over project link in sidebar', async () => {
    const sidebarProjectLink = await $('aside nav li a[href="/p/prefetch-test"]')
    await sidebarProjectLink.moveTo()

    // Wait for prefetch by polling the cache directly
    await browser.waitUntil(
      async () => {
        const state = await browser.execute(
          () =>
            (window as any).__TSR_ROUTER__?.options?.context?.queryClient?.getQueryState(
              ['beads', 'prefetch-test'],
            ),
        )
        return state?.status === 'success'
      },
      { timeout: 3000, timeoutMsg: 'prefetch never populated the cache' },
    )

    // Proof: cache already has data BEFORE click
    const cachedBeforeClick = await browser.execute(
      () =>
        (window as any).__TSR_ROUTER__?.options?.context?.queryClient?.getQueryState(
          ['beads', 'prefetch-test'],
        )?.status,
    )
    expect(cachedBeforeClick).toBe('success')

    await sidebarProjectLink.click()
    await browser.waitUntil(
      () => browser.execute(() => window.location.pathname === '/p/prefetch-test'),
      { timeout: 10000 },
    )
  })
})
