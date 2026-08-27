import { fakeProject, ipcCalls, resetBrowserApp } from '../../helpers.js'

const PICKED_DIR = '/tmp/fake-project'
const CREATED = fakeProject('fake-project', 'fake-project')
const REGISTERED = fakeProject('tako', 'tako')

describe('open project', () => {
  it('initializes a workspace when the picked folder has none', async () => {
    await resetBrowserApp('/', {
      list_projects: [],
      desktop_probe: null,
      'plugin:dialog|open': PICKED_DIR,
      // `confirm()` from @tauri-apps/plugin-dialog runs on `plugin:dialog|message`
      // and resolves true when the reply equals okLabel.
      'plugin:dialog|message': 'Initialize',
      add_project: {
        kind: 'needsInit',
        path: PICKED_DIR,
        suggestedPrefix: 'fake-project',
      },
      init_project: CREATED,
    })

    await $('button=Open project').click()
    await $('*=Project initialized').waitForDisplayed({ timeout: 15000 })

    expect(await ipcCalls('add_project')).toEqual([
      { cmd: 'add_project', args: { path: PICKED_DIR } },
    ])
    expect(await ipcCalls('init_project')).toEqual([
      {
        cmd: 'init_project',
        args: { path: PICKED_DIR, prefix: 'fake-project' },
      },
    ])
  })

  it('registers without initializing when the folder is already a workspace', async () => {
    await resetBrowserApp('/', {
      list_projects: [],
      desktop_probe: null,
      'plugin:dialog|open': PICKED_DIR,
      add_project: { kind: 'registered', project: REGISTERED },
      init_project: REGISTERED,
    })

    await $('button=Open project').click()
    await $('*=Project opened').waitForDisplayed({ timeout: 15000 })

    expect(await ipcCalls('add_project')).toHaveLength(1)
    expect(await ipcCalls('init_project')).toHaveLength(0)
  })

  it('initializes the picked folder directly from Init project', async () => {
    await resetBrowserApp('/', {
      list_projects: [],
      desktop_probe: null,
      'plugin:dialog|open': PICKED_DIR,
      init_project: CREATED,
    })

    await $('button=Init project').click()
    await $('*=Project initialized').waitForDisplayed({ timeout: 15000 })

    const initCalls = await ipcCalls('init_project')
    expect(initCalls).toHaveLength(1)
    expect((initCalls[0].args as { path: string }).path).toBe(PICKED_DIR)
    expect(await ipcCalls('add_project')).toHaveLength(0)
  })
})
