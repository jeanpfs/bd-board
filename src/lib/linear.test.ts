import { describe, expect, it } from 'vitest'

import { buildLinearSyncArgs, parseLinearStatus } from './linear'

// `bd linear status --json` captured without credentials (bd-json-shapes §12).
const CAPTURED_STATUS = {
  auth_mode: 'none',
  configured: false,
  has_api_key: false,
  has_oauth: false,
  last_sync: '',
  pending_push: 10,
  schema_version: 1,
  team_id: '',
  team_ids: null,
  total_issues: 11,
  with_linear_ref: 0,
}

describe('parseLinearStatus', () => {
  it('reads the unconfigured status without credentials', () => {
    expect(parseLinearStatus(CAPTURED_STATUS)).toEqual({
      configured: false,
      has_api_key: false,
      team_id: '',
      last_sync: '',
      pending_push: 10,
      with_linear_ref: 0,
      total_issues: 11,
    })
  })

  it('reads a configured status with a team and last sync', () => {
    expect(
      parseLinearStatus({
        ...CAPTURED_STATUS,
        configured: true,
        has_api_key: true,
        team_id: 'BIL',
        last_sync: '2026-11-11T22:00:00Z',
        with_linear_ref: 23,
      }),
    ).toMatchObject({
      configured: true,
      has_api_key: true,
      team_id: 'BIL',
      last_sync: '2026-11-11T22:00:00Z',
      with_linear_ref: 23,
    })
  })

  it('defaults absent fields to empty values', () => {
    expect(parseLinearStatus({})).toEqual({
      configured: false,
      has_api_key: false,
      team_id: '',
      last_sync: '',
      pending_push: 0,
      with_linear_ref: 0,
      total_issues: 0,
    })
  })

  it('refuses output that is not a JSON object', () => {
    expect(() => parseLinearStatus(null)).toThrow()
    expect(() => parseLinearStatus('configured')).toThrow()
    expect(() => parseLinearStatus([])).toThrow()
  })
})

describe('buildLinearSyncArgs', () => {
  it('uses no direction flag for both ways, which is bd default', () => {
    expect(
      buildLinearSyncArgs({
        direction: 'both',
        relations: false,
        dryRun: false,
      }),
    ).toEqual(['linear', 'sync'])
  })

  it('maps pull and push to their flags', () => {
    expect(
      buildLinearSyncArgs({
        direction: 'pull',
        relations: false,
        dryRun: false,
      }),
    ).toEqual(['linear', 'sync', '--pull'])
    expect(
      buildLinearSyncArgs({
        direction: 'push',
        relations: false,
        dryRun: false,
      }),
    ).toEqual(['linear', 'sync', '--push'])
  })

  it('adds relations and dry-run in a stable order', () => {
    expect(
      buildLinearSyncArgs({
        direction: 'pull',
        relations: true,
        dryRun: false,
      }),
    ).toEqual(['linear', 'sync', '--pull', '--relations'])
    expect(
      buildLinearSyncArgs({
        direction: 'both',
        relations: false,
        dryRun: true,
      }),
    ).toEqual(['linear', 'sync', '--dry-run'])
    expect(
      buildLinearSyncArgs({ direction: 'push', relations: true, dryRun: true }),
    ).toEqual(['linear', 'sync', '--push', '--relations', '--dry-run'])
  })
})
