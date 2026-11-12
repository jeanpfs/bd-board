/** Linear integration: status shape and `bd linear sync` argument building. */

/** `bd linear status --json`, shaped for the Integrations settings. */
export interface LinearStatus {
  configured: boolean
  has_api_key: boolean
  team_id: string
  last_sync: string
  pending_push: number
  with_linear_ref: number
  total_issues: number
}

export type LinearDirection = 'pull' | 'push' | 'both'

export interface LinearSyncOptions {
  direction: LinearDirection
  relations: boolean
  dryRun: boolean
}

/** Combined bd output and exit status; a non-zero exit is a displayed result. */
export interface LinearSyncResult {
  output: string
  exitCode: number
}

function bool(value: unknown): boolean {
  return value === true
}

function text(value: unknown): string {
  return typeof value === 'string' ? value : ''
}

function count(value: unknown): number {
  return typeof value === 'number' && Number.isFinite(value) ? value : 0
}

/** Reads `bd linear status --json`; absent fields default to empty values. */
export function parseLinearStatus(raw: unknown): LinearStatus {
  if (typeof raw !== 'object' || raw === null || Array.isArray(raw)) {
    throw new Error('Linear status is not an object')
  }
  const data = raw as Record<string, unknown>
  return {
    configured: bool(data['configured']),
    has_api_key: bool(data['has_api_key']),
    team_id: text(data['team_id']),
    last_sync: text(data['last_sync']),
    pending_push: count(data['pending_push']),
    with_linear_ref: count(data['with_linear_ref']),
    total_issues: count(data['total_issues']),
  }
}

/** `bd linear sync` flags; "both" is bd's default and takes no flag. */
export function buildLinearSyncArgs(opts: LinearSyncOptions): string[] {
  const args = ['linear', 'sync']
  if (opts.direction === 'pull') args.push('--pull')
  if (opts.direction === 'push') args.push('--push')
  if (opts.relations) args.push('--relations')
  if (opts.dryRun) args.push('--dry-run')
  return args
}
