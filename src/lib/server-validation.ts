import type { BeadColumn, BeadUpdate } from './types'

const PROJECT_RE = /^[A-Za-z0-9][A-Za-z0-9_.-]{0,127}$/
const BEAD_ID_RE = /^[A-Za-z0-9][A-Za-z0-9_.-]{0,159}$/
const STATUSES = new Set<BeadColumn>([
  'open',
  'in_progress',
  'blocked',
  'closed',
])
const TYPES = new Set(['task', 'bug', 'feature', 'epic', 'chore', 'decision'])
const LABEL_RE = /^[A-Za-z0-9][A-Za-z0-9_.-]{0,63}$/

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

function updateLabels(input: Record<string, unknown>): string[] | undefined {
  if (!('labels' in input)) return undefined
  const value = input['labels']
  if (!Array.isArray(value)) throw new Error('labels must be a list')
  const labels = value.map((item) => {
    if (typeof item !== 'string') throw new Error('labels must be text')
    return item.trim()
  })
  const unique = Array.from(new Set(labels.filter(Boolean))).sort()
  for (const label of unique) {
    if (!LABEL_RE.test(label)) throw new Error('Label is invalid')
  }
  return unique
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

export function parseCreateBeadInput(input: unknown): {
  project: string
  title: string
  description?: string
  type?: string
  parent?: string
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
  const data = record(input)
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

  const labels = updateLabels(data)
  if (labels !== undefined) update.labels = labels

  if (Object.keys(update).length === 0) {
    throw new Error('No bead updates provided')
  }

  return {
    project: requiredString(data, 'project', PROJECT_RE, 'Project'),
    id: requiredString(data, 'id', BEAD_ID_RE, 'Bead id'),
    update,
  }
}

export function assertWritesEnabled(
  env: Pick<NodeJS.ProcessEnv, string> = process.env,
): void {
  const value = String(env['BD_BOARD_ALLOW_WRITE'] ?? '').toLowerCase()
  if (!['1', 'true', 'yes'].includes(value)) {
    throw new Error(
      'Writes are disabled. Set BD_BOARD_ALLOW_WRITE=true to create, edit, comment, or delete beads.',
    )
  }
}
