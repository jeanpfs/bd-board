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
    await $('nav[aria-label="Project"] li a').waitForExist({ timeout: 20000 })
  })

  it('renders the project views as centered icons with a title tooltip', async () => {
    await $('[aria-label="Collapse sidebar"]').click()
    await waitForSidebarWidth(COLLAPSED)

    const rows = await browser.execute(() =>
      [...document.querySelectorAll('nav[aria-label="Project"] li a')].map(
        (a) => ({
          title: a.getAttribute('title'),
          text: (a as HTMLElement).innerText.trim(),
          hasIcon: Boolean(a.querySelector('svg')),
          justify: getComputedStyle(a).justifyContent,
        }),
      ),
    )

    expect(rows.map((r) => r.title)).toEqual([
      'Overview',
      'Board',
      'Hierarchy',
      'Knowledge',
      'Agents',
    ])
    expect(rows[0]).toEqual({
      title: 'Overview',
      text: '',
      hasIcon: true,
      justify: 'center',
    })
  })

  it('lands on the Overview and marks it current', async () => {
    const current = await browser.execute(() =>
      [...document.querySelectorAll('nav[aria-label="Project"] a')]
        .filter((a) => a.getAttribute('aria-current') === 'page')
        .map((a) => (a as HTMLElement).innerText.trim()),
    )
    expect(current).toEqual(['Overview'])
  })

  it('switches back to all projects from the switcher', async () => {
    await $('aside [aria-label^="Switch project"]').click()
    const item = await $('[role="menuitem"]*=tako')
    await expect(item).toBeDisplayed()
    expect(await item.$('[aria-label="Current"]').isExisting()).toBe(true)

    await $('[role="menuitem"]*=All projects').click()
    await browser.waitUntil(
      async () => (await browser.getUrl()).endsWith('/') === true,
      { timeout: 5000, timeoutMsg: 'navigation to all projects failed' },
    )
    await expect($('nav[aria-label="Projects"]')).toBeDisplayed()
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
