import { validateCustomStatusList } from './custom-statuses.ts'
import { parseViews, queryTextError, VIEWS_KV_KEY } from './views.ts'
import { LABEL_RE } from './labels'
import { isRelationKind, isRemovableRelation } from './relations'
import type { RelationKind, RemovableRelationKind } from './relations'
import type { BeadColumn, BeadUpdate, BulkPatch } from './types'

const PROJECT_RE = /^[A-Za-z0-9][A-Za-z0-9_.-]{0,127}$/
const BEAD_ID_RE = /^[A-Za-z0-9][A-Za-z0-9_.-]{0,159}$/
const STATUSES = new Set<BeadColumn>([
  'open',
  'in_progress',
  'blocked',
  'closed',
])
const TYPES = new Set(['task', 'bug', 'feature', 'epic', 'chore', 'decision'])

function record(input: unknown): Record<string, unknown> {
  if (!input || typeof input !== 'object' || Array.isArray(input)) {
    throw new Error('Invalid request payload')
  }
  return input as Record<string, unknown>
}

function requiredString(
  input: Record<string, unknown>,
  key: string,
  pattern: RegExp,
  label: string,
): string {
  const value = input[key]
  if (typeof value !== 'string') throw new Error(`${label} is required`)
  const trimmed = value.trim()
  if (!pattern.test(trimmed)) throw new Error(`${label} is invalid`)
  return trimmed
}

function optionalText(
  input: Record<string, unknown>,
  key: string,
  max: number,
): string | undefined {
  const value = input[key]
  if (value === undefined || value === null) return undefined
  if (typeof value !== 'string') throw new Error(`${key} must be text`)
  const trimmed = value.trim()
  if (!trimmed) return undefined
  if (trimmed.length > max) throw new Error(`${key} is too long`)
  return trimmed
}

function updateText(
  input: Record<string, unknown>,
  key: string,
  max: number,
): string | undefined {
  if (!(key in input)) return undefined
  const value = input[key]
  if (value === null) return ''
  if (typeof value !== 'string') throw new Error(`${key} must be text`)
  const trimmed = value.trim()
  if (trimmed.length > max) throw new Error(`${key} is too long`)
  return trimmed
}

function parseLabelList(value: unknown, key: string): string[] {
  if (!Array.isArray(value)) throw new Error(`${key} must be a list`)
  const labels = value.map((item) => {
    if (typeof item !== 'string') throw new Error(`${key} must be text`)
    return item.trim()
  })
  const unique = Array.from(new Set(labels.filter(Boolean))).sort()
  for (const label of unique) {
    if (!LABEL_RE.test(label)) throw new Error('Label is invalid')
  }
  return unique
}

function updateLabels(input: Record<string, unknown>): string[] | undefined {
  if (!('labels' in input)) return undefined
  return parseLabelList(input['labels'], 'labels')
}

export function parseProjectInput(input: unknown): { project: string } {
  const data = record(input)
  return {
    project: requiredString(data, 'project', PROJECT_RE, 'Project'),
  }
}

export function parseBeadInput(input: unknown): {
  project: string
  id: string
} {
  const data = record(input)
  return {
    project: requiredString(data, 'project', PROJECT_RE, 'Project'),
    id: requiredString(data, 'id', BEAD_ID_RE, 'Bead id'),
  }
}

export function parseStatusUpdateInput(input: unknown): {
  project: string
  id: string
  status: BeadColumn
} {
  const data = record(input)
  const status = data['status']
  if (typeof status !== 'string' || !STATUSES.has(status as BeadColumn)) {
    throw new Error('Status is invalid')
  }
  return {
    project: requiredString(data, 'project', PROJECT_RE, 'Project'),
    id: requiredString(data, 'id', BEAD_ID_RE, 'Bead id'),
    status: status as BeadColumn,
  }
}

export function parseCloseBeadInput(input: unknown): {
  project: string
  id: string
  reason?: string
  force: boolean
} {
  const data = record(input)
  const force = data['force'] ?? false
  if (typeof force !== 'boolean') throw new Error('force must be true or false')
  return {
    project: requiredString(data, 'project', PROJECT_RE, 'Project'),
    id: requiredString(data, 'id', BEAD_ID_RE, 'Bead id'),
    reason: optionalText(data, 'reason', 2000),
    force,
  }
}

function parseBulkIds(data: Record<string, unknown>): string[] {
  const value = data['ids']
  if (!Array.isArray(value)) throw new Error('ids must be a list')
  const ids = Array.from(
    new Set(
      value.map((item) => {
        if (typeof item !== 'string') throw new Error('Bead id is invalid')
        const id = item.trim()
        if (!BEAD_ID_RE.test(id)) throw new Error('Bead id is invalid')
        return id
      }),
    ),
  )
  if (ids.length === 0) throw new Error('Select at least one bead')
  if (ids.length > 200) throw new Error('Too many beads')
  return ids
}

export function parseUpdateManyInput(input: unknown): {
  project: string
  ids: string[]
  patch: BulkPatch
} {
  const data = record(input)
  const project = requiredString(data, 'project', PROJECT_RE, 'Project')
  const ids = parseBulkIds(data)
  const raw = record(data['patch'])
  const patch: BulkPatch = {}

  if ('status' in raw) {
    const status = raw['status']
    if (
      typeof status !== 'string' ||
      status === 'closed' ||
      !STATUSES.has(status as BeadColumn)
    ) {
      throw new Error('Status is invalid')
    }
    patch.status = status
  }

  if ('priority' in raw) {
    const priority = raw['priority']
    if (
      typeof priority !== 'number' ||
      !Number.isInteger(priority) ||
      priority < 0 ||
      priority > 4
    ) {
      throw new Error('Priority is invalid')
    }
    patch.priority = priority
  }

  const assignee = updateText(raw, 'assignee', 120)
  if (assignee !== undefined) {
    if (assignee.startsWith('-')) throw new Error('assignee is invalid')
    patch.assignee = assignee
  }

  const due = updateText(raw, 'due', 40)
  if (due !== undefined) {
    if (/[\r\n]/.test(due) || due.startsWith('-')) {
      throw new Error('due is invalid')
    }
    patch.due = due
  }

  if ('addLabels' in raw) {
    patch.addLabels = parseLabelList(raw['addLabels'], 'addLabels')
  }

  if (Object.keys(patch).length === 0) {
    throw new Error('No bead updates provided')
  }
  return { project, ids, patch }
}

export function parseCloseManyInput(input: unknown): {
  project: string
  ids: string[]
  reason?: string
  force: boolean
} {
  const data = record(input)
  const force = data['force'] ?? false
  if (typeof force !== 'boolean') throw new Error('force must be true or false')
  return {
    project: requiredString(data, 'project', PROJECT_RE, 'Project'),
    ids: parseBulkIds(data),
    reason: optionalText(data, 'reason', 2000),
    force,
  }
}

export function parseTailEventsInput(input: unknown): {
  project: string
  since: number
  limit: number
} {
  const data = record(input)
  const since = data['since']
  if (typeof since !== 'number' || !Number.isInteger(since) || since < 0) {
    throw new Error('since must be a whole number, zero or more')
  }
  const limit = data['limit']
  if (
    typeof limit !== 'number' ||
    !Number.isInteger(limit) ||
    limit < 1 ||
    limit > 1000
  ) {
    throw new Error('limit must be a whole number from 1 to 1000')
  }
  return {
    project: requiredString(data, 'project', PROJECT_RE, 'Project'),
    since,
    limit,
  }
}

export function parseStaleInput(input: unknown): {
  project: string
  days: number
} {
  const data = record(input)
  const days = data['days']
  if (
    typeof days !== 'number' ||
    !Number.isInteger(days) ||
    days < 1 ||
    days > 365
  ) {
    throw new Error('days must be a whole number from 1 to 365')
  }
  return {
    project: requiredString(data, 'project', PROJECT_RE, 'Project'),
    days,
  }
}

export function parseClaimInput(input: unknown): {
  project: string
  id: string
  actor: string | undefined
} {
  const data = record(input)
  const actor = optionalText(data, 'actor', 200)
  if (actor?.startsWith('-')) throw new Error('actor is invalid')
  return {
    project: requiredString(data, 'project', PROJECT_RE, 'Project'),
    id: requiredString(data, 'id', BEAD_ID_RE, 'Bead id'),
    actor,
  }
}

export function parseUnclaimInput(input: unknown): {
  project: string
  id: string
  force: boolean
  actor: string | undefined
} {
  const data = record(input)
  const force = data['force'] ?? false
  if (typeof force !== 'boolean') throw new Error('force must be true or false')
  const actor = optionalText(data, 'actor', 200)
  if (actor?.startsWith('-')) throw new Error('actor is invalid')
  return {
    project: requiredString(data, 'project', PROJECT_RE, 'Project'),
    id: requiredString(data, 'id', BEAD_ID_RE, 'Bead id'),
    force,
    actor,
  }
}

/** Config keys the board may read and write. */
const CONFIG_KEYS: Record<string, true> = {
  'claim.pools': true,
  'status.custom': true,
  'events-journal': true,
  'linear.api_key': true,
  'linear.team_id': true,
  'linear.project_id': true,
}

const POOL_NAME_RE = /^[A-Za-z0-9][A-Za-z0-9._@-]*$/
const LINEAR_ID_RE = /^[A-Za-z0-9][A-Za-z0-9._-]{0,127}$/

/** Validates a value for an allowlisted key before bd sees it. */
export function parseSetConfigInput(input: unknown): {
  project: string
  key: string
  value: string
} {
  const { project, key } = parseConfigKeyInput(input)
  const data = record(input)
  const value = data['value']
  if (typeof value !== 'string' || /[\r\n]/.test(value)) {
    throw new Error('Config value is invalid')
  }
  if (key === 'events-journal' && value !== 'true' && value !== 'false') {
    throw new Error('events-journal must be true or false')
  }
  if (key === 'status.custom') {
    const problem = validateCustomStatusList(value)
    if (problem) throw new Error(problem)
  }
  if (key === 'claim.pools') {
    for (const pool of value === '' ? [] : value.split(',')) {
      if (!POOL_NAME_RE.test(pool.trim())) {
        throw new Error(`pool name ${pool.trim()} is invalid`)
      }
    }
  }
  if (key === 'linear.api_key' && (/\s/.test(value) || value.startsWith('-'))) {
    throw new Error(
      'linear.api_key must not contain whitespace or start with -',
    )
  }
  if (
    (key === 'linear.team_id' || key === 'linear.project_id') &&
    value !== '' &&
    !LINEAR_ID_RE.test(value)
  ) {
    throw new Error(`${key} is invalid`)
  }
  return { project, key, value }
}

/** Reads a config key; the Linear API key is write-only and never returned. */
export function parseGetConfigInput(input: unknown): {
  project: string
  key: string
} {
  const parsed = parseConfigKeyInput(input)
  if (parsed.key === 'linear.api_key') {
    throw new Error('linear.api_key is write-only')
  }
  return parsed
}

/** Validates `bd linear sync` options from the Integrations form. */
export function parseLinearSyncInput(input: unknown): {
  project: string
  direction: 'pull' | 'push' | 'both'
  relations: boolean
  dryRun: boolean
} {
  const data = record(input)
  const direction = data['direction']
  const relations = data['relations']
  const dryRun = data['dryRun']
  if (direction !== 'pull' && direction !== 'push' && direction !== 'both') {
    throw new Error('Linear direction is not allowed')
  }
  if (typeof relations !== 'boolean' || typeof dryRun !== 'boolean') {
    throw new Error('Linear sync flags must be booleans')
  }
  return {
    project: requiredString(data, 'project', PROJECT_RE, 'Project'),
    direction,
    relations,
    dryRun,
  }
}

export function parseConfigKeyInput(input: unknown): {
  project: string
  key: string
} {
  const data = record(input)
  const key = data['key']
  if (typeof key !== 'string' || !Object.hasOwn(CONFIG_KEYS, key)) {
    throw new Error('Config key is not allowed')
  }
  return {
    project: requiredString(data, 'project', PROJECT_RE, 'Project'),
    key,
  }
}

/** Validates a bd query expression before it reaches bd. */
export function parseQueryInput(input: unknown): {
  project: string
  query: string
} {
  const data = record(input)
  const query = data['query']
  if (typeof query !== 'string') throw new Error('Query is required.')
  const problem = queryTextError(query)
  if (problem) throw new Error(problem)
  return {
    project: requiredString(data, 'project', PROJECT_RE, 'Project'),
    query: query.trim(),
  }
}

/** Only the shared views key is reachable from the board. */
export function parseViewsKeyInput(input: unknown): {
  project: string
  key: string
} {
  const data = record(input)
  if (data['key'] !== VIEWS_KV_KEY) throw new Error('kv key is not allowed')
  return {
    project: requiredString(data, 'project', PROJECT_RE, 'Project'),
    key: VIEWS_KV_KEY,
  }
}

/** Validates the shared views list before it is written to bd kv. */
export function parseViewsWriteInput(input: unknown): {
  project: string
  key: string
  value: string
} {
  const { project, key } = parseViewsKeyInput(input)
  const value = record(input)['value']
  if (typeof value !== 'string' || value.length > 200_000) {
    throw new Error('Shared views value is invalid')
  }
  let entries: unknown
  try {
    entries = JSON.parse(value)
  } catch {
    throw new Error('Shared views value is invalid')
  }
  if (!Array.isArray(entries) || parseViews(value).length !== entries.length) {
    throw new Error('Shared views value is invalid')
  }
  return { project, key, value }
}

function relationParts<T extends RelationKind>(
  data: Record<string, unknown>,
  kind: T,
): { project: string; id: string; kind: T; target: string } {
  const id = requiredString(data, 'id', BEAD_ID_RE, 'Bead id')
  const target = requiredString(data, 'target', BEAD_ID_RE, 'Target bead id')
  if (id === target) throw new Error('A bead cannot relate to itself')
  return {
    project: requiredString(data, 'project', PROJECT_RE, 'Project'),
    id,
    kind,
    target,
  }
}

export function parseRelationInput(input: unknown): {
  project: string
  id: string
  kind: RelationKind
  target: string
} {
  const data = record(input)
  const kind = data['kind']
  if (!isRelationKind(kind)) throw new Error('Unknown relation kind')
  return relationParts(data, kind)
}

export function parseRemoveRelationInput(input: unknown): {
  project: string
  id: string
  kind: RemovableRelationKind
  target: string
} {
  const data = record(input)
  const kind = data['kind']
  if (!isRelationKind(kind) || !isRemovableRelation(kind))
    throw new Error('Unknown relation kind')
  return relationParts(data, kind)
}

export function parseDeferInput(input: unknown): {
  project: string
  id: string
  until?: string
} {
  const data = record(input)
  const until = optionalText(data, 'until', 40)
  if (until !== undefined && /[\r\n]/.test(until)) {
    throw new Error('until is invalid')
  }
  return {
    project: requiredString(data, 'project', PROJECT_RE, 'Project'),
    id: requiredString(data, 'id', BEAD_ID_RE, 'Bead id'),
    until,
  }
}

export function parseCreateBeadInput(input: unknown): {
  project: string
  title: string
  description?: string
  type?: string
  parent?: string
  labels?: string[]
} {
  const data = record(input)
  const title = optionalText(data, 'title', 240)
  if (!title) throw new Error('Title is required')

  const type = optionalText(data, 'type', 40) ?? 'task'
  if (!TYPES.has(type)) throw new Error('Type is invalid')

  const parent = optionalText(data, 'parent', 160)
  if (parent && !BEAD_ID_RE.test(parent))
    throw new Error('Parent bead id is invalid')

  return {
    project: requiredString(data, 'project', PROJECT_RE, 'Project'),
    title,
    description: optionalText(data, 'description', 12000),
    type,
    parent,
    labels: updateLabels(data),
  }
}

export function parseCommentInput(input: unknown): {
  project: string
  id: string
  text: string
} {
  const data = record(input)
  const text = optionalText(data, 'text', 8000)
  if (!text) throw new Error('Comment text is required')
  return {
    project: requiredString(data, 'project', PROJECT_RE, 'Project'),
    id: requiredString(data, 'id', BEAD_ID_RE, 'Bead id'),
    text,
  }
}

export function parseUpdateBeadInput(input: unknown): {
  project: string
  id: string
  update: BeadUpdate
} {
  const raw = record(input)
  const data =
    raw['update'] === undefined ? raw : { ...raw, ...record(raw['update']) }
  const update: BeadUpdate = {}

  if ('title' in data) {
    const title = updateText(data, 'title', 240)
    if (!title) throw new Error('Title is required')
    update.title = title
  }

  const description = updateText(data, 'description', 12000)
  if (description !== undefined) update.description = description

  const acceptance = updateText(data, 'acceptance_criteria', 12000)
  if (acceptance !== undefined) update.acceptance_criteria = acceptance

  const design = updateText(data, 'design', 12000)
  if (design !== undefined) update.design = design

  const notes = updateText(data, 'notes', 12000)
  if (notes !== undefined) update.notes = notes

  if ('priority' in data) {
    const priority = data['priority']
    if (
      typeof priority !== 'number' ||
      !Number.isInteger(priority) ||
      priority < 0 ||
      priority > 4
    ) {
      throw new Error('Priority is invalid')
    }
    update.priority = priority
  }

  if ('issue_type' in data) {
    const issueType = updateText(data, 'issue_type', 40)
    if (!issueType || !TYPES.has(issueType)) throw new Error('Type is invalid')
    update.issue_type = issueType
  }

  const assignee = updateText(data, 'assignee', 120)
  if (assignee !== undefined) update.assignee = assignee

  const due = updateText(data, 'due', 40)
  if (due !== undefined) {
    if (/[\r\n]/.test(due)) throw new Error('due is invalid')
    update.due = due
  }

  if ('estimate' in data) {
    const estimate = data['estimate']
    if (
      typeof estimate !== 'number' ||
      !Number.isInteger(estimate) ||
      estimate < 1
    ) {
      throw new Error('Estimate is invalid')
    }
    update.estimate = estimate
  }

  const labels = updateLabels(data)
  if (labels !== undefined) update.labels = labels

  if (Object.keys(update).length === 0) {
    throw new Error('No bead updates provided')
  }

  return {
    project: requiredString(raw, 'project', PROJECT_RE, 'Project'),
    id: requiredString(raw, 'id', BEAD_ID_RE, 'Bead id'),
    update,
  }
}
