import { describe, expect, it } from 'vitest'

import {
  isBdAtLeast,
  isBdEventsUnsupported,
  isBdOlderThan,
  parseBdVersion,
  unsupportedFeedTitle,
} from './bd-version'

describe('parseBdVersion', () => {
  it('parses common shapes', () => {
    expect(parseBdVersion('bd version 1.3.0 (Homebrew)')).toEqual([1, 3, 0])
    expect(parseBdVersion('1.2.1')).toEqual([1, 2, 1])
    expect(parseBdVersion('v1.3.0-rc1')).toEqual([1, 3, 0])
  })

  it('returns null when unparseable', () => {
    expect(parseBdVersion('')).toBeNull()
    expect(parseBdVersion('garbage')).toBeNull()
    expect(parseBdVersion('1.3')).toBeNull()
  })
})

describe('version comparison', () => {
  it('compares numerically per component', () => {
    expect(isBdAtLeast('1.3.0', '1.3.0')).toBe(true)
    expect(isBdAtLeast('1.10.0', '1.3.0')).toBe(true)
    expect(isBdAtLeast('1.2.9', '1.3.0')).toBe(false)
    expect(isBdOlderThan('1.2.9', '1.3.0')).toBe(true)
    expect(isBdOlderThan('1.3.0', '1.3.0')).toBe(false)
  })

  it('treats unknown versions as neither at-least nor older', () => {
    expect(isBdAtLeast('garbage', '1.3.0')).toBe(false)
    expect(isBdOlderThan('garbage', '1.3.0')).toBe(false)
    expect(isBdOlderThan('', '1.3.0')).toBe(false)
  })
})

describe('feed unsupported detection', () => {
  it('detects a missing bd events command', () => {
    expect(
      isBdEventsUnsupported('Error: unknown command "events" for "bd"'),
    ).toBe(true)
    expect(isBdEventsUnsupported('spawn ENOENT')).toBe(false)
    expect(isBdEventsUnsupported(undefined)).toBe(false)
  })

  it('picks the title by cause', () => {
    expect(unsupportedFeedTitle('unknown command "events"')).toBe(
      'Live updates need bd >= 1.3.0 (see README)',
    )
    expect(unsupportedFeedTitle('bd not found')).toBe(
      'Live updates unavailable: bd not found',
    )
  })
})
