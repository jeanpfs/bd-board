import {
  fakeProject,
  resetBrowserApp,
  waitForSidebarWidth,
} from '../../helpers.js'

const COLLAPSED = 48

describe('sidebar collapse inside a project', () => {
  beforeEach(async () => {
    await resetBrowserApp('/p/tako', {
      list_projects: [fakeProject('tako', 'tako')],
      list_beads: [],
      desktop_probe: null,
      get_project_knowledge: { entries: [] },
    })
    await $('nav[aria-label="Projects"] li a').waitForExist({ timeout: 20000 })
  })

  it('hides the Quick filters group when collapsed', async () => {
    await expect($('nav[aria-label="Quick filters"]')).toBeDisplayed()

    await $('[aria-label="Collapse sidebar"]').click()
    await waitForSidebarWidth(COLLAPSED)

    expect(await $$('nav[aria-label="Quick filters"]')).toHaveLength(0)
  })

  it('renders project rows as centered icons with a title tooltip', async () => {
    await $('[aria-label="Collapse sidebar"]').click()
    await waitForSidebarWidth(COLLAPSED)

    const rows = await browser.execute(() =>
      [...document.querySelectorAll('nav[aria-label="Projects"] li a')].map(
        (a) => ({
          title: a.getAttribute('title'),
          text: (a as HTMLElement).innerText.trim(),
          hasIcon: Boolean(a.querySelector('svg')),
          justify: getComputedStyle(a).justifyContent,
        }),
      ),
    )

    expect(rows).toHaveLength(1)
    expect(rows[0]).toEqual({
      title: 'tako',
      text: '',
      hasIcon: true,
      justify: 'center',
    })
  })
  it('Home link is displayed and not active when inside a project', async () => {
    const homeLink = await $('nav[aria-label="Home"] a')
    await expect(homeLink).toBeDisplayed()

    const current = await homeLink.getAttribute('aria-current')
    expect(current).toBeNull()
  })

  it('Home link navigates back to the dashboard', async () => {
    const homeLink = await $('nav[aria-label="Home"] a')

    await homeLink.click()
    await browser.waitUntil(
      async () => (await browser.getUrl()).endsWith('/') === true,
      { timeout: 5000, timeoutMsg: 'navigation to home failed' },
    )

    // Verify Home link is now active
    const current = await homeLink.getAttribute('aria-current')
    expect(current).toBe('page')
  })

  it('shows Home link with icon and tooltip when collapsed inside a project', async () => {
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
})
