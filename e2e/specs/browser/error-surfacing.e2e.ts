import { ipcCalls, resetBrowserApp } from '../../helpers.js'

const PICKED_DIR = '/tmp/fake-project-for-error-test'

describe('error message surfacing', () => {
  it('surfaces init_project string rejection errors in toast (not generic fallback)', async () => {
    const specificError =
      'This workspace is already initialized. Use --reinit-local to reinitialize.'

    // Set up page without mocking init_project yet (will mock after load)
    await resetBrowserApp('/', {
      list_projects: [],
      desktop_probe: null,
      'plugin:dialog|open': PICKED_DIR,
    })

    // Mock init_project to reject with specific error AFTER page loads
    const mock = await browser.tauri.mock('init_project')
    await mock.mockRejectedValue(specificError)

    // Click button and wait for error toast
    await $('button=Init project').click()
    await $(`*=${specificError}`).waitForDisplayed({ timeout: 5000 })

    // Verify exact message appears
    const errorToastElements = await $(`*=${specificError}`)
    expect(errorToastElements).toBeTruthy()

    // Verify generic fallback does NOT appear
    const fallbackElements = await $$('*=Failed to initialize project')
    expect(fallbackElements).toHaveLength(0)
  })

  it('surfaces add_project string rejection errors in toast', async () => {
    const addProjectError = 'Permission denied: cannot read project directory'

    await resetBrowserApp('/', {
      list_projects: [],
      desktop_probe: null,
      'plugin:dialog|open': PICKED_DIR,
    })

    // Mock add_project to reject with specific error
    const mock = await browser.tauri.mock('add_project')
    await mock.mockRejectedValue(addProjectError)

    // Click button
    await $('button=Open project').click()
    await $(`*=${addProjectError}`).waitForDisplayed({ timeout: 5000 })

    // Verify exact message appears
    const errorToastElements = await $(`*=${addProjectError}`)
    expect(errorToastElements).toBeTruthy()

    // Verify generic fallback does NOT appear
    const fallbackElements = await $$('*=Failed to open project')
    expect(fallbackElements).toHaveLength(0)
  })
})
