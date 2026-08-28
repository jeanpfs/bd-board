import { describe, it, expect } from 'vitest'
import { toErrorMessage } from './utils'

describe('toErrorMessage', () => {
  it('preserves string errors (como Tauri invoke rejeita)', () => {
    const err = 'project directory no longer exists: /path/to/project'
    const result = toErrorMessage(err, 'Fallback')
    expect(result).toBe(err)
  })

  it('extracts Error.message', () => {
    const err = new Error('Something went wrong')
    const result = toErrorMessage(err, 'Fallback')
    expect(result).toBe('Something went wrong')
  })

  it('uses fallback for unknown types', () => {
    const result = toErrorMessage(123, 'Fallback message')
    expect(result).toBe('Fallback message')
  })

  it('uses fallback for null/undefined', () => {
    expect(toErrorMessage(null, 'Fallback 1')).toBe('Fallback 1')
    expect(toErrorMessage(undefined, 'Fallback 2')).toBe('Fallback 2')
  })

  it('handles tako bug scenario: resolve_dir returns string error', () => {
    // Simulate what resolve_dir returns when path doesn't exist
    const resolveError =
      'project directory no longer exists: /Users/jeanpfs/Code/tako'
    const result = toErrorMessage(resolveError, 'Failed to load beads')

    // The fix: string error is preserved, NOT replaced with generic fallback
    expect(result).toBe(resolveError)
    expect(result).not.toBe('Failed to load beads')
  })
})
