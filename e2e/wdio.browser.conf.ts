const DEV_SERVER_URL = process.env.E2E_DEV_SERVER_URL ?? 'http://localhost:3009'

/**
 * Browser mode: the frontend runs in Chrome against the Vite dev server and the
 * service intercepts `invoke()` at the JS boundary.
 *
 * Command mocking is impossible in the native run: Tauri defines
 * `window.__TAURI_INTERNALS__` (and its `invoke`) as non-writable and
 * non-configurable, and `@wdio/tauri-plugin` only wraps the `withGlobalTauri`
 * global, which bundled `@tauri-apps/api` calls never touch. Specs that need to
 * stub backend commands or native dialogs therefore live here.
 */
export const config: WebdriverIO.Config = {
  runner: 'local',
  specs: ['./specs/browser/**/*.e2e.ts'],
  maxInstances: 1,

  services: [
    [
      'tauri',
      {
        mode: 'browser',
        devServerUrl: DEV_SERVER_URL,
      },
    ],
  ],

  capabilities: [
    {
      browserName: 'chrome',
      'goog:chromeOptions': {
        args: ['--headless=new', '--window-size=1440,900'],
      },
    },
  ],

  logLevel: 'warn',
  bail: 0,
  waitforTimeout: 15000,
  connectionRetryTimeout: 90000,
  connectionRetryCount: 3,

  framework: 'mocha',
  reporters: ['spec'],
  mochaOpts: {
    ui: 'bdd',
    timeout: 90000,
  },
}
