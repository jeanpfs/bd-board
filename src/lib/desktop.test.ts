import { describe, expect, it } from 'vitest'

import { normalizeDesktopProbe } from './desktop'

describe('normalizeDesktopProbe', () => {
  it('accepts snake_case probe payloads from Tauri commands', () => {
    expect(
      normalizeDesktopProbe({
        bd_binary: 'bd',
        bd_version: 'bd 1.2.3',
        registry_path: '/Users/me/.config/bd-board/projects.json',
        project_count: 3,
      }),
    ).toEqual({
      bdBinary: 'bd',
      bdVersion: 'bd 1.2.3',
      registryPath: '/Users/me/.config/bd-board/projects.json',
      projectCount: 3,
    })
  })
})
