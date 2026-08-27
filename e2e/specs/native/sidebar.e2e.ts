import {
  resetApp,
  sidebarWidth,
  storedCollapsed,
  waitForSidebarWidth,
} from '../../helpers.js'

const EXPANDED = 232
const COLLAPSED = 48

describe('sidebar collapse', () => {
  beforeEach(async () => {
    await resetApp('/')
  })

  it('starts expanded and collapses to an icon rail', async () => {
    expect(await sidebarWidth()).toBe(EXPANDED)

    await $('[aria-label="Collapse sidebar"]').click()
    await waitForSidebarWidth(COLLAPSED)

    const expandButton = await $('[aria-label="Expand sidebar"]')
    await expect(expandButton).toBeDisplayed()
    expect(await expandButton.getAttribute('aria-expanded')).toBe('false')
    expect(await storedCollapsed()).toBe('1')
  })

  it('keeps the toggle reachable inside the collapsed rail', async () => {
    await $('[aria-label="Collapse sidebar"]').click()
    await waitForSidebarWidth(COLLAPSED)

    const insideRail = await browser.execute(() => {
      const aside = document.querySelector('aside')
      const button = aside?.querySelector('button[aria-label]')
      if (!aside || !button) return false
      const rail = aside.getBoundingClientRect()
      const rect = button.getBoundingClientRect()
      return rect.left >= rail.left && rect.right <= rail.right
    })

    expect(insideRail).toBe(true)
  })

  it('expands again and clears the stored preference', async () => {
    await $('[aria-label="Collapse sidebar"]').click()
    await waitForSidebarWidth(COLLAPSED)

    await $('[aria-label="Expand sidebar"]').click()
    await waitForSidebarWidth(EXPANDED)

    expect(await storedCollapsed()).toBeNull()
    await expect($('[aria-label="Collapse sidebar"]')).toBeDisplayed()
  })

  it('restores the collapsed state after a reload', async () => {
    await $('[aria-label="Collapse sidebar"]').click()
    await waitForSidebarWidth(COLLAPSED)

    await browser.execute(() => {
      window.location.reload()
    })
    await browser.waitUntil(
      async () =>
        (await browser.execute(
          () =>
            document.readyState === 'complete' &&
            Boolean(document.querySelector('aside button[aria-label]')),
        )) === true,
      { timeout: 20000, timeoutMsg: 'app did not reload' },
    )

    expect(await sidebarWidth()).toBe(COLLAPSED)
    await expect($('[aria-label="Expand sidebar"]')).toBeDisplayed()
    expect(await storedCollapsed()).toBe('1')
  })

  it('shows the logo and toggle button centered when collapsed', async () => {
    await $('[aria-label="Collapse sidebar"]').click()
    await waitForSidebarWidth(COLLAPSED)

    const logoVisible = await browser.execute(() => {
      const aside = document.querySelector('aside')
      const logo = aside?.querySelector('a[aria-label="bd board home"] svg')
      if (!aside || !logo) return false
      const rail = aside.getBoundingClientRect()
      const logoRect = logo.getBoundingClientRect()
      return (
        logoRect.left >= rail.left &&
        logoRect.right <= rail.right &&
        logoRect.width > 0
      )
    })

    expect(logoVisible).toBe(true)
  })

  it('displays the logo and text in expanded state', async () => {
    const logoVisible = await browser.execute(() => {
      const link = document.querySelector('a[aria-label="bd board home"]')
      const svg = link?.querySelector('svg')
      const text = link?.querySelector('span')
      return {
        hasSvg: Boolean(svg),
        hasText: Boolean(text) && text!.textContent === 'bd board',
        justify: getComputedStyle(link!).justifyContent,
      }
    })

    expect(logoVisible).toEqual({
      hasSvg: true,
      hasText: true,
      justify: 'normal',
    })
  })

  it('navigates to home when clicking the Home link', async () => {
    // Start in expanded state, verify Home link is in nav
    const homeLink = await $('nav[aria-label="Home"] a')
    await expect(homeLink).toBeDisplayed()

    // Verify it's active when on home route (/)
    let current = await homeLink.getAttribute('aria-current')
    expect(current).toBe('page')

    // Click a project first
    const projectLink = await $('nav[aria-label="Projects"] li a')
    await projectLink.click()
    await browser.waitUntil(
      async () => (await browser.getUrl()).includes('/p/') === true,
      { timeout: 5000, timeoutMsg: 'navigation to project failed' },
    )

    // Verify Home link is no longer active
    current = await homeLink.getAttribute('aria-current')
    expect(current).toBeNull()

    // Click Home to return
    await homeLink.click()
    await browser.waitUntil(
      async () => (await browser.getUrl()).endsWith('/') === true,
      { timeout: 5000, timeoutMsg: 'navigation to home failed' },
    )

    // Verify Home link is active again
    current = await homeLink.getAttribute('aria-current')
    expect(current).toBe('page')
  })

  it('shows Home link with icon and tooltip in collapsed state', async () => {
    await $('[aria-label="Collapse sidebar"]').click()
    await waitForSidebarWidth(COLLAPSED)

    const homeRow = await browser.execute(() => {
      const link = document.querySelector('nav[aria-label="Home"] a')
      if (!link) return null
      return {
        title: link.getAttribute('title'),
        hasIcon: Boolean(link.querySelector('svg')),
        text: link.textContent.trim() || '',
        justify: getComputedStyle(link).justifyContent,
      }
    })

    expect(homeRow).toEqual({
      title: 'Home',
      hasIcon: true,
      text: '',
      justify: 'center',
    })
  })

  it('never renders the removed View group', async () => {
    const viewGroups = await $$('nav[aria-label="View"]')
    expect(viewGroups).toHaveLength(0)
  })
})
