import { afterEach, describe, expect, it, vi } from 'vitest'

import { getStoredIdentity, setStoredIdentity } from './identity'

function memoryStorage(): Storage {
  const store = new Map<string, string>()
  return {
    getItem: (key) => store.get(key) ?? null,
    setItem: (key, value) => {
      store.set(key, value)
    },
    removeItem: (key) => {
      store.delete(key)
    },
    clear: () => store.clear(),
    key: () => null,
    get length() {
      return store.size
    },
  }
}

afterEach(() => {
  vi.unstubAllGlobals()
})

describe('identity', () => {
  it('round-trips a stored identity', () => {
    vi.stubGlobal('localStorage', memoryStorage())
    expect(getStoredIdentity()).toBeNull()
    setStoredIdentity('jean.pfs2@gmail.com')
    expect(getStoredIdentity()).toBe('jean.pfs2@gmail.com')
    setStoredIdentity(null)
    expect(getStoredIdentity()).toBeNull()
  })

  it('falls back to null when localStorage is unavailable', () => {
    vi.stubGlobal('localStorage', undefined)
    expect(getStoredIdentity()).toBeNull()
    expect(() => setStoredIdentity('claude-agent')).not.toThrow()
  })
})
