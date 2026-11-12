import { fakeProject, resetBrowserApp } from '../../helpers.js'

const project = fakeProject('tako', 'tako')

describe('command palette', () => {
  it('opens on Mod+K, finds a bead by title and opens it with Enter', async () => {
    await resetBrowserApp('/p/tako', {
      list_projects: [project],
      list_beads: [
        {
          id: 'tako-1',
          project: project.id,
          title: 'Rotate the signing keys',
          status: 'open',
          priority: 1,
        },
        {
          id: 'tako-2',
          project: project.id,
          title: 'Write the release notes',
          status: 'open',
          priority: 2,
        },
      ],
      desktop_probe: null,
      get_project_knowledge: { entries: [] },
    })
    await $('nav[aria-label="Project"] li a').waitForExist({ timeout: 20000 })

    const mac = await browser.execute(() => /Mac/i.test(navigator.platform))
    await browser.keys([mac ? 'Meta' : 'Control', 'k'])

    const input = await $('input[placeholder^="Search beads"]')
    await input.waitForDisplayed({ timeout: 10000 })
    await input.setValue('signing')

    await $('[cmdk-item]*=Rotate the signing keys').waitForDisplayed({
      timeout: 10000,
    })
    expect(await $$('[cmdk-item]*=Write the release notes')).toHaveLength(0)

    await browser.keys('Enter')

    await $('[role="dialog"]*=Rotate the signing keys').waitForDisplayed({
      timeout: 10000,
    })
    expect(await $$('input[placeholder^="Search beads"]')).toHaveLength(0)
  })
})
