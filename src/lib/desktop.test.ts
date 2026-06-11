import { describe, expect, it } from 'vitest'

import { normalizeDesktopProbe } from './desktop'

describe('normalizeDesktopProbe', () => {
  it('accepts snake_case probe payloads from Tauri commands', () => {
    expect(
      normalizeDesktopProbe({
        bd_binary: 'bd',
        bd_version: 'bd 1.2.3',
        project_roots: ['/tmp/code'],
        root_statuses: [{ path: '/tmp/code', exists: true }],
      }),
    ).toEqual({
      bdBinary: 'bd',
      bdVersion: 'bd 1.2.3',
      projectRoots: ['/tmp/code'],
      rootStatuses: [{ path: '/tmp/code', exists: true }],
    })
  })
})
