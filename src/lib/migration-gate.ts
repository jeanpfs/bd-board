/**
 * bd refuses to auto-migrate a remote-backed database whose schema is behind
 * the binary (#4259): only one clone may migrate, every other clone adopts.
 * The choice belongs to a human, so the app surfaces the gate and never runs
 * a migration itself.
 *
 * bd reports the gate two ways:
 * - JSON (`--json` commands that fail): `{ error, hint, remote_migrate_gate }`.
 * - Text on stderr, for read-only commands that continue on the old schema
 *   (and may still fail later, e.g. `table not found: leases`).
 */

export interface MigrationGateOption {
  /** bd's option id (`migrate`, `adopt`) when reported as JSON. */
  id?: string
  label: string
  commands: string[]
  when?: string
  risk?: string
}

export interface MigrationGate {
  pending: number
  currentVersion: number
  latestVersion: number
  options: MigrationGateOption[]
  hint?: string
  docs?: string
}

const TEXT_GATE_RE =
  /refusing to auto-apply (\d+) pending schema migrations[^\n]*\(v(\d+)\s*->\s*v(\d+)\)/

/** Bullet lines of the text warning: `• who (qualifier): cmd && cmd`. */
const TEXT_OPTION_RE = /^\s*•\s*(.+?):\s*(bd .+)$/

const OPTION_LABEL: Record<string, string> = {
  migrate: 'Designated migrator',
  adopt: 'Every other clone',
}

function parseJsonGate(text: string): MigrationGate | null {
  const start = text.indexOf('{')
  const end = text.lastIndexOf('}')
  if (start < 0 || end <= start) return null
  let json: Record<string, unknown>
  try {
    json = JSON.parse(text.slice(start, end + 1)) as Record<string, unknown>
  } catch {
    return null
  }
  const gate = json['remote_migrate_gate'] as
    | Record<string, unknown>
    | undefined
  if (!gate || typeof gate !== 'object') return null

  const current = Number(gate['current_version'])
  const latest = Number(gate['latest_version'])
  const pending = Number(gate['pending'] ?? latest - current)
  const options = Array.isArray(gate['options'])
    ? (gate['options'] as Record<string, unknown>[]).map((o) => {
        const id = typeof o['id'] === 'string' ? o['id'] : undefined
        return {
          id,
          label: (id && OPTION_LABEL[id]) || id || 'Option',
          commands: Array.isArray(o['commands'])
            ? (o['commands'] as unknown[]).map(String)
            : [],
          when: typeof o['when'] === 'string' ? o['when'] : undefined,
          risk: typeof o['risk'] === 'string' ? o['risk'] : undefined,
        }
      })
    : []

  return {
    pending: Number.isFinite(pending) ? pending : 0,
    currentVersion: current,
    latestVersion: latest,
    options,
    hint: typeof json['hint'] === 'string' ? json['hint'] : undefined,
    docs: typeof gate['docs'] === 'string' ? gate['docs'] : undefined,
  }
}

function parseTextGate(text: string): MigrationGate | null {
  const match = TEXT_GATE_RE.exec(text)
  if (!match) return null
  const options: MigrationGateOption[] = []
  for (const line of text.split('\n')) {
    const opt = TEXT_OPTION_RE.exec(line)
    if (!opt) continue
    const label = opt[1].trim()
    options.push({
      label: label.charAt(0).toUpperCase() + label.slice(1),
      commands: opt[2].split('&&').map((c) => c.trim()),
    })
  }
  return {
    pending: Number(match[1]),
    currentVersion: Number(match[2]),
    latestVersion: Number(match[3]),
    options,
  }
}

/** Finds a migration gate in bd output; JSON wins over the text warning. */
export function parseMigrationGate(
  stdout: string,
  stderr: string,
): MigrationGate | null {
  return (
    parseJsonGate(stdout) ??
    parseJsonGate(stderr) ??
    parseTextGate(stderr) ??
    parseTextGate(stdout)
  )
}

/*
 * Errors reach the UI as plain strings (server functions and Tauri `invoke`
 * both serialize the message), so the gate travels inside the message behind
 * a marker line.
 */
const MARKER = 'bd-migration-gate:'

export function migrationGateError(gate: MigrationGate, detail: string): Error {
  return new Error(
    `${summarizeMigrationGate(gate)}\n${detail}\n${MARKER}${JSON.stringify(gate)}`,
  )
}

export function migrationGateFromMessage(
  message: string,
): MigrationGate | null {
  const at = message.lastIndexOf(MARKER)
  if (at < 0) return null
  try {
    return JSON.parse(message.slice(at + MARKER.length)) as MigrationGate
  } catch {
    return null
  }
}

/** The message without the machine-readable marker line. */
export function stripMigrationGate(message: string): string {
  const at = message.lastIndexOf(`\n${MARKER}`)
  return at < 0 ? message : message.slice(0, at)
}

export function summarizeMigrationGate(gate: MigrationGate): string {
  return `Schema migration pending (v${gate.currentVersion} → v${gate.latestVersion}, ${gate.pending} migrations): writes are blocked until one clone migrates.`
}
