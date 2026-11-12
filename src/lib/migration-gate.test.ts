import { describe, expect, it } from 'vitest'

import {
  migrationGateError,
  migrationGateFromMessage,
  parseMigrationGate,
} from './migration-gate'
import { toErrorMessage } from './utils'

// Captured from bd 1.3.0 on a remote-backed database 17 migrations behind.
const TEXT_WARNING = `Warning: refusing to auto-apply 17 pending schema migrations to a remote-backed database (v49 -> v66): migrating clones independently forks the schema (#4259)
  Read-only command: continuing on schema v49 without migrating.
  Writes are blocked until the schema is reconciled.  This is a
  coordination decision, not an auto-fix - do NOT run a migration unless
  you are the single designated migrator (only ONE clone may migrate a
  shared remote, else the schema forks; #4259):
    • designated migrator (only ONE machine): bd migrate --force && bd dolt push
    • every other clone (another already migrated): bd bootstrap
    • several machines: only ONE migrates; sync each other clone and run
      bd dolt pull after the migrator pushes, before upgrading it
Error: search count issues: Error 1146: table not found: leases`

const JSON_ERROR = JSON.stringify({
  error:
    'refusing to auto-apply 17 pending schema migrations to a remote-backed database (v49 -> v66)',
  hint: 'Coordination decision required: only ONE clone may migrate a shared remote.',
  remote_migrate_gate: {
    current_version: 49,
    latest_version: 66,
    pending: 17,
    docs: 'https://example.test/upgrading',
    options: [
      {
        id: 'migrate',
        commands: ['bd migrate --force', 'bd dolt push'],
        when: 'you are the single designated migrator',
        risk: 'the schema forks if another clone also migrates',
      },
      {
        id: 'adopt',
        commands: ['bd bootstrap'],
        when: 'another machine has already migrated and pushed',
        risk: 're-clones and replaces the local database',
      },
    ],
  },
})

describe('parseMigrationGate', () => {
  it('reads the structured gate bd prints as JSON', () => {
    const gate = parseMigrationGate('', JSON_ERROR)
    expect(gate).toMatchObject({
      pending: 17,
      currentVersion: 49,
      latestVersion: 66,
      docs: 'https://example.test/upgrading',
    })
    expect(gate?.options.map((o) => [o.id, o.label, o.commands])).toEqual([
      [
        'migrate',
        'Designated migrator',
        ['bd migrate --force', 'bd dolt push'],
      ],
      ['adopt', 'Every other clone', ['bd bootstrap']],
    ])
  })

  it('reads versions and command bullets from the text warning', () => {
    const gate = parseMigrationGate('', TEXT_WARNING)
    expect(gate).toMatchObject({
      pending: 17,
      currentVersion: 49,
      latestVersion: 66,
    })
    expect(gate?.options).toEqual([
      {
        label: 'Designated migrator (only ONE machine)',
        commands: ['bd migrate --force', 'bd dolt push'],
      },
      {
        label: 'Every other clone (another already migrated)',
        commands: ['bd bootstrap'],
      },
    ])
  })

  it('returns null for ordinary failures', () => {
    expect(parseMigrationGate('', 'Error: issue lab-1 not found')).toBeNull()
  })
})

describe('migration gate errors', () => {
  it('round-trips the gate through an error message', () => {
    const gate = parseMigrationGate('', JSON_ERROR)!
    const error = migrationGateError(gate, 'Error: table not found: leases')
    expect(migrationGateFromMessage(error.message)).toEqual(gate)
  })

  it('shows people the summary and bd failure, not the encoded gate', () => {
    const gate = parseMigrationGate('', TEXT_WARNING)!
    const error = migrationGateError(gate, 'Error: table not found: leases')
    expect(toErrorMessage(error, 'fallback')).toBe(
      'Schema migration pending (v49 → v66, 17 migrations): writes are blocked until one clone migrates.\nError: table not found: leases',
    )
  })
})
