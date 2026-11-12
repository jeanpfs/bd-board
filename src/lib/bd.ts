import { execFile } from 'node:child_process'
import { promisify } from 'node:util'
import * as fsSync from 'node:fs'
import * as path from 'node:path'
import * as os from 'node:os'
import type { BdAdapter } from './bd-contract.ts'
import type {
  Bead,
  BeadDetail,
  BeadLink,
  BeadUpdate,
  Comment,
  DeletePlan,
  Project,
  ProjectComment,
  ProjectCounts,
  ProjectKnowledge,
  ProjectKnowledgeEntry,
  RelatedBead,
  StatusCategory,
  ReadyExplain,
} from './types.ts'
import { BUILT_IN_STATUSES, CATEGORY_COLUMN } from './types.ts'
import { parseReadyExplain } from './ready.ts'
import { buildAddRelationArgs, buildRemoveRelationArgs } from './relations.ts'
import type { RelationKind, RemovableRelationKind } from './relations.ts'
import { parseKnowledgeCommentText } from './knowledge.ts'
import { loadRegistry } from './registry.ts'
import type { RegistryEntry } from './registry.ts'
import { migrationGateError, parseMigrationGate } from './migration-gate.ts'
import type { MigrationGate } from './migration-gate.ts'
import { JOURNAL_DISABLED_MARKER, tailArgs, tailResult } from './events.ts'
import type { TailEventsResult } from './events.ts'

const execFileAsync = promisify(execFile)

const BD_FALLBACK = '/opt/homebrew/bin/bd'
const MAX_BUFFER = 64 * 1024 * 1024
export const COMMENTS_LIMIT = 250
export const KNOWLEDGE_LIMIT = 500

function bdCandidates(): string[] {
  const candidates: string[] = []

  // (a) BD_BIN when set and non-empty
  const bdBin = process.env['BD_BIN']
  if (bdBin) {
    candidates.push(bdBin)
  }

  // (b) $HOME/.local/bin/bd — the wrapper
  const home = os.homedir()
  if (home) {
    candidates.push(path.join(home, '.local', 'bin', 'bd'))
  }

  // (c) "bd" from PATH
  candidates.push('bd')

  // (d) Fallback
  candidates.push(BD_FALLBACK)

  return candidates
}

export function bdErrorMessage(
  stdout: string,
  stderr: string,
  exitCode: number | null,
): string {
  const stdoutTrim = stdout.trim()
  const stderrTrim = stderr.trim()

  // bd --json reports errors as JSON on stdout or, for some commands, stderr.
  for (const candidate of [stdoutTrim, stderrTrim]) {
    if (!candidate.startsWith('{')) continue
    try {
      const json = JSON.parse(candidate) as Record<string, unknown>
      for (const key of ['message', 'error']) {
        const text = json[key]
        if (typeof text === 'string' && text) {
          return typeof json.hint === 'string' && json.hint
            ? `${text} (${json.hint})`
            : text
        }
      }
    } catch {
      // Not JSON, keep looking
    }
  }

  // Fall back to stderr
  if (stderrTrim) {
    return `bd exited with status ${exitCode}: ${stderrTrim}`
  }

  // Last resort
  return `bd exited with status ${exitCode}`
}

export async function bdExec(
  dir: string,
  args: string[],
): Promise<{ bin: string; code: number; stdout: string; stderr: string }> {
  const candidates = bdCandidates()

  for (const candidate of candidates) {
    try {
      const { stdout, stderr } = await execFileAsync(candidate, args, {
        cwd: dir,
        maxBuffer: MAX_BUFFER,
      })
      return { bin: candidate, code: 0, stdout, stderr }
    } catch (err: unknown) {
      const error = err as {
        code?: string | number
        stdout?: string
        stderr?: string
      }

      if (error.code === 'ENOENT') {
        continue
      }
      if (typeof error.code === 'number') {
        return {
          bin: candidate,
          code: error.code,
          stdout: error.stdout ?? '',
          stderr: error.stderr ?? '',
        }
      }
      throw new Error(
        bdErrorMessage(error.stdout ?? '', error.stderr ?? String(err), null),
      )
    }
  }

  // Exhausted all candidates
  const candidateList = candidates.join(', ')
  throw new Error(`bd not found (tried: ${candidateList})`)
}

/** The error for a failed bd run, carrying a migration gate when bd reported one. */
function bdFailure(result: {
  code: number
  stdout: string
  stderr: string
}): Error {
  const message = bdErrorMessage(result.stdout, result.stderr, result.code)
  const gate = parseMigrationGate(result.stdout, result.stderr)
  if (!gate) return new Error(message)
  // The text warning repeats the gate; keep only bd's own failure line.
  const failure = result.stderr
    .split('\n')
    .reverse()
    .find((line) => line.startsWith('Error:'))
  return migrationGateError(gate, failure ?? message)
}

async function bdRaw(dir: string, args: string[]): Promise<string> {
  const result = await bdExec(dir, args)
  if (result.code !== 0) throw bdFailure(result)
  return result.stdout
}

/** List-shaped bd output as rows: bd prints `null` for an empty list. */
export function asRows(value: unknown): Record<string, unknown>[] {
  return Array.isArray(value) ? (value as Record<string, unknown>[]) : []
}

async function bdJson<T>(dir: string, args: string[]): Promise<T> {
  const raw = await bdRaw(dir, args)
  const trimmed = raw.trim()
  if (!trimmed) return [] as unknown as T
  return JSON.parse(trimmed) as T
}

async function bdJsonLines<T>(dir: string, args: string[]): Promise<T[]> {
  const raw = await bdRaw(dir, args)
  return raw
    .split('\n')
    .map((line) => line.trim())
    .filter(Boolean)
    .map((line) => JSON.parse(line) as T)
}

const EMPTY_COUNTS: ProjectCounts = {
  open: 0,
  in_progress: 0,
  blocked: 0,
  closed: 0,
  deferred: 0,
  total: 0,
}

function buildCounts(
  rows: { status: string; c: string | number }[],
  categories: Map<string, StatusCategory> = new Map(),
): ProjectCounts {
  const totals = { ...EMPTY_COUNTS }
  for (const row of rows) {
    const n = Number(row.c)
    totals.total += n
    switch (row.status) {
      case 'open':
      case 'pinned':
        totals.open += n
        break
      case 'in_progress':
      case 'hooked':
        totals.in_progress += n
        break
      case 'blocked':
        totals.blocked += n
        break
      case 'closed':
        totals.closed += n
        break
      case 'deferred':
        totals.deferred += n
        break
      default: {
        // Custom status: count it where the board shows it.
        const category = categories.get(row.status) ?? 'unspecified'
        if (category === 'frozen') totals.deferred += n
        else totals[CATEGORY_COLUMN[category]] += n
      }
    }
  }
  return totals
}

export function buildCountsFromGroups(
  groups: { group: string; count: number }[],
  categories?: Map<string, StatusCategory>,
): ProjectCounts {
  return buildCounts(
    groups.map((g) => ({ status: g.group, c: g.count })),
    categories,
  )
}

const STATUS_CATEGORIES = new Set<string>([
  'active',
  'wip',
  'done',
  'frozen',
  'unspecified',
])

/** Custom status name → category, from `bd statuses --json`. */
export function parseStatusCategories(result: {
  custom_statuses?: { name?: unknown; category?: unknown }[]
}): Map<string, StatusCategory> {
  const categories = new Map<string, StatusCategory>()
  for (const status of result.custom_statuses ?? []) {
    if (typeof status.name !== 'string') continue
    const category =
      typeof status.category === 'string' &&
      STATUS_CATEGORIES.has(status.category)
        ? (status.category as StatusCategory)
        : 'unspecified'
    categories.set(status.name, category)
  }
  return categories
}

/** Empty when bd can't tell (gated database): custom statuses then fall back to "unspecified". */
async function statusCategories(
  dir: string,
): Promise<Map<string, StatusCategory>> {
  try {
    return parseStatusCategories(await bdJson(dir, ['statuses', '--json']))
  } catch {
    return new Map()
  }
}

/**
 * `bd count` keeps working on a gated database (read-only on the old
 * schema), so this is where the dashboard learns about a pending migration.
 */
async function counts(
  dir: string,
  categories: Map<string, StatusCategory>,
): Promise<{ counts: ProjectCounts; migration: MigrationGate | null }> {
  try {
    const result = await bdExec(dir, ['count', '--by-status', '--json'])
    const migration = parseMigrationGate(result.stdout, result.stderr)
    if (result.code !== 0) return { counts: { ...EMPTY_COUNTS }, migration }
    const json = JSON.parse(result.stdout) as {
      groups?: { group: string; count: number }[]
    }
    return {
      counts: buildCountsFromGroups(json.groups ?? [], categories),
      migration,
    }
  } catch {
    return { counts: { ...EMPTY_COUNTS }, migration: null }
  }
}

/** Runs `fn` over `items` with at most `limit` in flight, keeping order. */
async function mapLimit<TItem, TResult>(
  items: TItem[],
  limit: number,
  fn: (item: TItem) => Promise<TResult>,
): Promise<TResult[]> {
  const results: TResult[] = new Array(items.length)
  let next = 0
  async function worker() {
    while (next < items.length) {
      const index = next++
      results[index] = await fn(items[index])
    }
  }
  await Promise.all(
    Array.from({ length: Math.min(limit, items.length) }, worker),
  )
  return results
}

/** Projects probed at once; each runs three bd processes. */
const DISCOVERY_CONCURRENCY = 4

async function discoverProject(entry: RegistryEntry): Promise<Project> {
  const base = {
    id: entry.id,
    name: entry.label,
    dir: entry.path,
    beadsPath: '',
    prefix: null,
    external: false,
    missing: false,
    migration: null,
    counts: { ...EMPTY_COUNTS },
  }

  if (!fsSync.existsSync(entry.path)) {
    return { ...base, missing: true, error: 'folder no longer exists' }
  }

  try {
    const probeResult = await bdJson<{
      path?: string
      database_path?: string
      prefix?: string
    }>(entry.path, ['where', '--json'])

    if (!probeResult.path) {
      return { ...base, error: 'bd where returned no beads path' }
    }

    const expectedBeads = path.join(entry.path, '.beads')
    const categories = await statusCategories(entry.path)
    const { counts: projectCounts, migration } = await counts(
      entry.path,
      categories,
    )
    return {
      ...base,
      beadsPath: probeResult.path,
      prefix: probeResult.prefix || null,
      external: probeResult.path !== expectedBeads,
      error: null,
      migration,
      counts: projectCounts,
    }
  } catch (err) {
    return { ...base, error: err instanceof Error ? err.message : String(err) }
  }
}

async function discoverProjects(): Promise<Project[]> {
  const entries = await loadRegistry()
  const results = await mapLimit(
    entries,
    DISCOVERY_CONCURRENCY,
    discoverProject,
  )
  return results.sort((a, b) => {
    const diff = b.counts.total - a.counts.total
    return diff !== 0 ? diff : a.name.localeCompare(b.name)
  })
}

async function resolveDir(projectId: string): Promise<string> {
  const entries = await loadRegistry()
  const entry = entries.find((e) => e.id === projectId)
  if (!entry) {
    throw new Error(`unknown project id: ${projectId}`)
  }
  // Without this check, execFile fails with ENOENT for the missing cwd and
  // bdExec misreports it as "bd not found".
  if (!fsSync.existsSync(entry.path)) {
    throw new Error(`project directory no longer exists: ${entry.path}`)
  }
  return entry.path
}

interface DependencyEdge {
  from: string
  to: string
  type: string
}

/**
 * Edges only exist in the `bd list`/`bd export` shape, where each entry carries
 * `depends_on_id`. `bd show` reuses the same field name for expanded beads, so
 * entries without `depends_on_id` are skipped.
 */
function parseDependencyEdges(raw: Record<string, unknown>): DependencyEdge[] {
  const list = Array.isArray(raw['dependencies'])
    ? (raw['dependencies'] as Record<string, unknown>[])
    : []
  const ownerId = typeof raw['id'] === 'string' ? raw['id'] : ''

  return list.flatMap((entry) => {
    const to = entry['depends_on_id']
    if (typeof to !== 'string' || !to) return []
    const from =
      typeof entry['issue_id'] === 'string' ? entry['issue_id'] : ownerId
    if (!from) return []
    return [{ from, to, type: String(entry['type'] ?? 'blocks') }]
  })
}

function collectEdges(
  rawBeads: Record<string, unknown>[],
  knownIds: Set<string>,
): DependencyEdge[] {
  const seen = new Set<string>()
  const edges: DependencyEdge[] = []

  for (const raw of rawBeads) {
    for (const edge of parseDependencyEdges(raw)) {
      if (!knownIds.has(edge.from) || !knownIds.has(edge.to)) continue
      const key = `${edge.from}|${edge.to}|${edge.type}`
      if (seen.has(key)) continue
      seen.add(key)
      edges.push(edge)
    }
  }

  return edges
}

function pushLink(
  target: Map<string, BeadLink[]>,
  id: string,
  link: BeadLink,
): void {
  const list = target.get(id) ?? []
  list.push(link)
  target.set(id, list)
}

export function buildBeadGraph(
  rawBeads: Record<string, unknown>[],
  categories: Map<string, StatusCategory> = new Map(),
): Bead[] {
  const beads = rawBeads.map((raw) => mapRawBead(raw, categories))
  const knownIds = new Set(beads.map((b) => b.id))
  const closedGates = new Set(
    beads
      .filter((b) => b.issue_type === 'gate' && b.status === 'closed')
      .map((b) => b.id),
  )
  // A resolved gate no longer blocks; bd keeps the edge but drops the block.
  const edges = collectEdges(rawBeads, knownIds).filter(
    (edge) => !(edge.type === 'blocks' && closedGates.has(edge.to)),
  )

  const linksById = new Map<string, BeadLink[]>()
  const parentById = new Map<string, string>()

  for (const edge of edges) {
    pushLink(linksById, edge.from, {
      id: edge.to,
      type: edge.type,
      direction: 'outgoing',
    })
    pushLink(linksById, edge.to, {
      id: edge.from,
      type: edge.type,
      direction: 'incoming',
    })
    if (edge.type === 'parent-child') parentById.set(edge.from, edge.to)
  }

  const withLinks = beads.map((bead) => {
    const links = linksById.get(bead.id)
    const parent = bead.parent ?? parentById.get(bead.id)
    return {
      ...bead,
      ...(parent ? { parent } : {}),
      ...(links ? { links } : {}),
    }
  })

  return deriveChildren(withLinks)
}

function deriveChildren(beads: Bead[]): Bead[] {
  const childMap = new Map<string, string[]>()
  for (const b of beads) {
    if (b.parent) {
      const list = childMap.get(b.parent) ?? []
      list.push(b.id)
      childMap.set(b.parent, list)
    }
  }

  const beadById = new Map(beads.map((b) => [b.id, b]))

  return beads.map((b) => {
    const childIds = childMap.get(b.id)
    if (!childIds?.length) return b
    return {
      ...b,
      children: childIds,
      childBeads: childIds
        .map((id) => beadById.get(id))
        .filter((x): x is Bead => x !== undefined),
    }
  })
}

/** Schedule and lifecycle fields; absent or empty values are left out, never null. */
function scheduleFields(raw: Record<string, unknown>): Partial<Bead> {
  const text = (key: string): string | undefined => {
    const value = raw[key]
    return typeof value === 'string' && value !== '' ? value : undefined
  }
  const minutes =
    typeof raw['estimated_minutes'] === 'number'
      ? raw['estimated_minutes']
      : undefined
  const fields = {
    due_at: text('due_at'),
    defer_until: text('defer_until'),
    estimated_minutes: minutes,
    started_at: text('started_at'),
    lease_expires_at: text('lease_expires_at'),
    heartbeat_at: text('heartbeat_at'),
    close_reason: text('close_reason'),
    external_ref: text('external_ref'),
    created_by: text('created_by'),
  }
  return Object.fromEntries(
    Object.entries(fields).filter(([, value]) => value !== undefined),
  )
}

/** `bd list` returns only its first page unless `--limit 0` asks for everything. */
function buildListBeadsArgs(): string[] {
  return ['list', '--all', '--limit', '0', '--json']
}
function mapRawBead(
  raw: Record<string, unknown>,
  categories: Map<string, StatusCategory> = new Map(),
): Bead {
  const status = raw['status'] as string
  const category = Object.prototype.hasOwnProperty.call(
    BUILT_IN_STATUSES,
    status,
  )
    ? undefined
    : categories.get(status)
  return {
    id: raw['id'] as string,
    title: raw['title'] as string,
    description: raw['description'] as string | undefined,
    acceptance_criteria: raw['acceptance_criteria'] as string | undefined,
    design: raw['design'] as string | undefined,
    notes: raw['notes'] as string | undefined,
    status,
    ...(category ? { status_category: category } : {}),
    priority: Number(raw['priority'] ?? 2),
    issue_type: raw['issue_type'] as string,
    assignee: raw['assignee'] as string | undefined,
    owner: raw['owner'] as string | undefined,
    created_at: raw['created_at'] as string | undefined,
    updated_at: raw['updated_at'] as string | undefined,
    closed_at: raw['closed_at'] as string | undefined,
    labels: Array.isArray(raw['labels']) ? (raw['labels'] as string[]) : [],
    parent: raw['parent'] as string | undefined,
    comment_count:
      raw['comment_count'] !== undefined
        ? Number(raw['comment_count'])
        : undefined,
    dependency_count:
      raw['dependency_count'] !== undefined
        ? Number(raw['dependency_count'])
        : undefined,
    dependent_count:
      raw['dependent_count'] !== undefined
        ? Number(raw['dependent_count'])
        : undefined,
    ...scheduleFields(raw),
  }
}

function mapComment(raw: Record<string, unknown>): Comment {
  return {
    id: String(raw['id'] ?? ''),
    author: (raw['author'] ?? raw['created_by']) as string | undefined,
    text: String(raw['text'] ?? raw['body'] ?? ''),
    created_at: raw['created_at'] as string | undefined,
  }
}

function mapProjectComment(raw: Record<string, unknown>): ProjectComment {
  const text = String(raw['text'] ?? '')
  const parsed = parseKnowledgeCommentText(text)
  return {
    id: String(raw['id'] ?? ''),
    bead_id: String(raw['bead_id'] ?? raw['issue_id'] ?? ''),
    bead_title: String(raw['bead_title'] ?? raw['title'] ?? '') || undefined,
    author: (raw['author'] ?? raw['created_by']) as string | undefined,
    text,
    created_at: raw['created_at'] as string | undefined,
    knowledge_type: parsed?.type,
  }
}

function mapKnowledgeEntry(
  raw: Record<string, unknown>,
): ProjectKnowledgeEntry | null {
  const comment = mapProjectComment(raw)
  const parsed = parseKnowledgeCommentText(comment.text)
  if (!parsed) return null
  return {
    ...comment,
    type: parsed.type,
    content: parsed.content,
    knowledge_type: parsed.type,
  }
}

/** `bd list` can hide gate issues; add the ones `bd gate list` reports. */
export function mergeGateRows(
  rows: Record<string, unknown>[],
  gates: unknown,
): Record<string, unknown>[] {
  const known = new Set(rows.map((row) => row['id']))
  return [...rows, ...asRows(gates).filter((gate) => !known.has(gate['id']))]
}

async function listBeads(projectId: string): Promise<Bead[]> {
  const dir = await resolveDir(projectId)
  const [raw, gates, categories] = await Promise.all([
    bdJson<unknown>(dir, buildListBeadsArgs()).then(asRows),
    bdJson<unknown>(dir, buildListGatesArgs()).then(asRows),
    statusCategories(dir),
  ])
  return buildBeadGraph(mergeGateRows(raw, gates), categories)
}

export function buildShowBeadArgs(id: string): string[] {
  return ['show', id, '--include-dependents', '--json']
}

function mapRelatedBead(d: Record<string, unknown>): RelatedBead {
  return {
    id: String(d['id'] ?? ''),
    title: String(d['title'] ?? ''),
    status: String(d['status'] ?? 'open'),
    issue_type: String(d['issue_type'] ?? 'task'),
    dependency_type: String(d['dependency_type'] ?? ''),
    ...(typeof d['due_at'] === 'string' ? { due_at: d['due_at'] } : {}),
  }
}

function mapRelatedList(
  raw: Record<string, unknown>,
  key: string,
): RelatedBead[] {
  const list = Array.isArray(raw[key])
    ? (raw[key] as Record<string, unknown>[])
    : []
  return list.map(mapRelatedBead)
}

export function mapBeadDetail(
  rawArr: Record<string, unknown>[],
  rawComments: Record<string, unknown>[],
): BeadDetail {
  const raw = rawArr[0] ?? {}
  const bead = mapRawBead(raw)
  const dependencies = mapRelatedList(raw, 'dependencies')
  const dependents = mapRelatedList(raw, 'dependents')
  const comments: Comment[] = rawComments.map(mapComment)
  return { ...bead, dependencies, dependents, comments }
}

async function getBeadDetail(
  projectId: string,
  id: string,
): Promise<BeadDetail> {
  const dir = await resolveDir(projectId)

  const [rawArr, rawComments] = await Promise.all([
    bdJson<unknown>(dir, buildShowBeadArgs(id)).then(asRows),
    bdJson<unknown>(dir, ['comments', id, '--json']).then(asRows, () => []),
  ])

  return mapBeadDetail(rawArr, rawComments)
}

async function addRelation(
  projectId: string,
  id: string,
  kind: RelationKind,
  target: string,
): Promise<void> {
  const dir = await resolveDir(projectId)
  await bdRaw(dir, buildAddRelationArgs(kind, id, target))
}

async function removeRelation(
  projectId: string,
  id: string,
  kind: RemovableRelationKind,
  target: string,
): Promise<void> {
  const dir = await resolveDir(projectId)
  await bdRaw(dir, buildRemoveRelationArgs(kind, id, target))
}

export function buildProjectKnowledge(
  issues: Record<string, unknown>[],
): ProjectKnowledge {
  const rawComments = issues.flatMap((issue) => {
    const issueComments = Array.isArray(issue['comments'])
      ? (issue['comments'] as Record<string, unknown>[])
      : []
    return issueComments.map((c) => ({ ...c, title: issue['title'] }))
  })

  const byDateDesc = (a: { created_at?: string }, b: { created_at?: string }) =>
    (b.created_at ?? '').localeCompare(a.created_at ?? '')

  const comments = rawComments
    .map(mapProjectComment)
    .sort(byDateDesc)
    .slice(0, COMMENTS_LIMIT)

  const knowledge = rawComments
    .map(mapKnowledgeEntry)
    .filter((entry): entry is ProjectKnowledgeEntry => entry !== null)
    .sort(byDateDesc)
    .slice(0, KNOWLEDGE_LIMIT)

  return { comments, knowledge }
}

async function getProjectKnowledge(
  projectId: string,
): Promise<ProjectKnowledge> {
  const dir = await resolveDir(projectId)
  try {
    const issues = await bdJsonLines<Record<string, unknown>>(dir, ['export'])
    return buildProjectKnowledge(issues)
  } catch {
    return { comments: [], knowledge: [] }
  }
}

async function updateBeadStatus(
  projectId: string,
  id: string,
  status: string,
): Promise<void> {
  const dir = await resolveDir(projectId)
  await bdRaw(dir, ['update', id, '--status', status])
}

function buildUpdateBeadArgs(
  id: string,
  opts: BeadUpdate,
  existingLabels: string[] = [],
): string[] {
  const args = ['update', id]

  if (opts.title !== undefined) args.push('--title', opts.title)
  if (opts.description !== undefined)
    args.push('--description', opts.description)
  if (opts.acceptance_criteria !== undefined)
    args.push('--acceptance', opts.acceptance_criteria)
  if (opts.design !== undefined) args.push('--design', opts.design)
  if (opts.notes !== undefined) args.push('--notes', opts.notes)
  if (opts.priority !== undefined)
    args.push('--priority', String(opts.priority))
  if (opts.issue_type !== undefined) args.push('--type', opts.issue_type)
  if (opts.assignee !== undefined) args.push('--assignee', opts.assignee)
  if (opts.due !== undefined) args.push('--due', opts.due)
  if (opts.estimate !== undefined)
    args.push('--estimate', String(opts.estimate))

  if (opts.labels !== undefined) {
    if (opts.labels.length > 0) {
      args.push('--set-labels', opts.labels.join(','))
    } else {
      for (const label of existingLabels) {
        args.push('--remove-label', label)
      }
    }
  }

  return args
}

async function updateBead(
  projectId: string,
  id: string,
  opts: BeadUpdate,
): Promise<void> {
  const dir = await resolveDir(projectId)
  const existing =
    opts.labels !== undefined ? await getBeadDetail(projectId, id) : undefined
  const args = buildUpdateBeadArgs(id, opts, existing?.labels ?? [])
  if (args.length <= 2) return
  await bdRaw(dir, args)
}

/** `--until` is omitted when no date is given, so bd defers indefinitely. */
function buildDeferBeadArgs(id: string, until?: string): string[] {
  return until ? ['defer', id, '--until', until] : ['defer', id]
}

function buildUndeferBeadArgs(id: string): string[] {
  return ['undefer', id]
}

async function deferBead(
  projectId: string,
  id: string,
  until?: string,
): Promise<void> {
  const dir = await resolveDir(projectId)
  await bdRaw(dir, buildDeferBeadArgs(id, until))
}

async function undeferBead(projectId: string, id: string): Promise<void> {
  const dir = await resolveDir(projectId)
  await bdRaw(dir, buildUndeferBeadArgs(id))
}

/**
 * The bead plus its parent-child descendants. Upstream `--cascade` also
 * follows `blocks`/`related` edges (fixed after bd 1.3.4), so a cascade
 * delete of a blocker would delete the work it blocks; passing this set
 * explicitly deletes only the subtree.
 */
export function deletionSet(beads: Bead[], id: string): string[] {
  const childrenOf = new Map<string, string[]>()
  for (const bead of beads) {
    if (!bead.parent) continue
    const list = childrenOf.get(bead.parent) ?? []
    list.push(bead.id)
    childrenOf.set(bead.parent, list)
  }
  const ids = [id]
  // The iterator also visits ids appended while looping (breadth-first).
  for (const current of ids) {
    for (const child of childrenOf.get(current) ?? []) {
      if (!ids.includes(child)) ids.push(child)
    }
  }
  return ids
}

/** Beads outside the deletion that depend on something inside it. */
export function unlinkedDependents(
  beads: Bead[],
  ids: string[],
): DeletePlan['unlinked'] {
  const deleting = new Set(ids)
  const byId = new Map(beads.map((b) => [b.id, b]))
  const seen = new Set<string>()
  const unlinked: DeletePlan['unlinked'] = []
  for (const id of ids) {
    for (const link of byId.get(id)?.links ?? []) {
      if (link.direction !== 'incoming' || deleting.has(link.id)) continue
      const key = `${link.id}|${link.type}`
      if (seen.has(key)) continue
      seen.add(key)
      unlinked.push({
        id: link.id,
        title: byId.get(link.id)?.title ?? link.id,
        type: link.type,
      })
    }
  }
  return unlinked
}

/**
 * Drops bd's CLI hints from the preview: the "use --cascade … or --force"
 * note and the "To proceed, run" command. The dialog explains both itself.
 */
function cleanDeletePreview(text: string): string {
  return text
    .split('\n')
    .filter(
      (line) =>
        !line.includes('has dependents not in deletion set') &&
        !line.startsWith('To proceed'),
    )
    .join('\n')
    .trim()
}

async function planDelete(
  dir: string,
  id: string,
): Promise<{ beads: Bead[]; ids: string[] }> {
  const beads = buildBeadGraph(
    asRows(await bdJson<unknown>(dir, buildListBeadsArgs())),
  )
  if (!beads.some((b) => b.id === id)) throw new Error(`bead not found: ${id}`)
  return { beads, ids: deletionSet(beads, id) }
}

async function previewDeleteBead(
  projectId: string,
  id: string,
): Promise<DeletePlan> {
  const dir = await resolveDir(projectId)
  const { beads, ids } = await planDelete(dir, id)
  const result = await bdExec(dir, buildPreviewDeleteBeadArgs(ids))
  // With dependents outside the set bd exits 1 but still prints the preview.
  if (result.code !== 0 && !result.stdout.includes('DELETE PREVIEW')) {
    throw bdFailure(result)
  }
  return {
    ids,
    preview: cleanDeletePreview(result.stdout),
    unlinked: unlinkedDependents(beads, ids),
  }
}

async function deleteBead(projectId: string, id: string): Promise<void> {
  const dir = await resolveDir(projectId)
  try {
    const { ids } = await planDelete(dir, id)
    await bdRaw(dir, buildDeleteBeadArgs(ids))
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err)
    throw new Error(`Unable to delete bead. ${message}`)
  }
}

function buildPreviewDeleteBeadArgs(ids: string[]): string[] {
  return ['delete', ...ids]
}

/** `--force` deletes the set and orphans outside dependents; never `--cascade`. */
function buildDeleteBeadArgs(ids: string[]): string[] {
  return ['delete', ...ids, '--force']
}

function buildCloseBeadArgs(
  id: string,
  opts: { reason?: string; force?: boolean },
): string[] {
  const args = ['close', id]
  if (opts.reason) args.push('--reason', opts.reason)
  if (opts.force) args.push('--force')
  return args
}

async function closeBead(
  projectId: string,
  id: string,
  opts: { reason?: string; force?: boolean },
): Promise<void> {
  const dir = await resolveDir(projectId)
  await bdRaw(dir, buildCloseBeadArgs(id, opts))
}

export function buildClaimArgs(id: string, actor?: string): string[] {
  const args = ['update', id, '--claim']
  if (actor) args.push('--actor', actor)
  return args
}

export function buildReadyExplainArgs(): string[] {
  return ['ready', '--explain', '--json', '--limit', '0']
}

async function claimBead(
  projectId: string,
  id: string,
  actor?: string,
): Promise<void> {
  const dir = await resolveDir(projectId)
  await bdRaw(dir, buildClaimArgs(id, actor))
}

export function buildListGatesArgs(): string[] {
  return ['gate', 'list', '--all', '--json']
}

export function buildResolveGateArgs(id: string): string[] {
  return ['gate', 'resolve', id]
}

/** Reverts only leases already expired (`--older-than 0s`) for this bead. */
export function buildReclaimBeadArgs(id: string): string[] {
  return ['reclaim', '--id', id, '--older-than', '0s', '--json']
}

export function buildUnclaimBeadArgs(
  id: string,
  force: boolean,
  actor?: string,
): string[] {
  const args = ['unclaim', id]
  if (force) args.push('--force')
  if (actor) args.push('--actor', actor)
  return args
}

export function buildGetConfigArgs(key: string): string[] {
  return ['config', 'get', key, '--json']
}

async function listGates(projectId: string): Promise<Bead[]> {
  const dir = await resolveDir(projectId)
  const raw = asRows(await bdJson<unknown>(dir, buildListGatesArgs()))
  return raw.map((row) => mapRawBead(row))
}

async function resolveGate(projectId: string, id: string): Promise<void> {
  const dir = await resolveDir(projectId)
  await bdRaw(dir, buildResolveGateArgs(id))
}

/** Number of beads `bd reclaim --json` reverted (`{"count":0,...}` when none). */
export function parseReclaimCount(stdout: string): number {
  let parsed: unknown
  try {
    parsed = JSON.parse(stdout.trim())
  } catch {
    throw new Error('Unexpected output from bd reclaim')
  }
  const count = (parsed as { count?: unknown } | null)?.count
  if (typeof count !== 'number' || !Number.isInteger(count) || count < 0) {
    throw new Error('Unexpected output from bd reclaim')
  }
  return count
}

async function reclaimBead(projectId: string, id: string): Promise<number> {
  const dir = await resolveDir(projectId)
  return parseReclaimCount(await bdRaw(dir, buildReclaimBeadArgs(id)))
}

async function unclaimBead(
  projectId: string,
  id: string,
  force: boolean,
  actor?: string,
): Promise<void> {
  const dir = await resolveDir(projectId)
  await bdRaw(dir, buildUnclaimBeadArgs(id, force, actor))
}

/** A config value as text; an unset key reads as the empty string. */
async function getConfig(projectId: string, key: string): Promise<string> {
  const dir = await resolveDir(projectId)
  const out = await bdJson<{ value?: unknown }>(dir, buildGetConfigArgs(key))
  return typeof out.value === 'string' ? out.value : ''
}

/** `bd ready --explain --json`, shaped for the Ready view. */
async function readyExplain(projectId: string): Promise<ReadyExplain> {
  const dir = await resolveDir(projectId)
  return parseReadyExplain(await bdJson<unknown>(dir, buildReadyExplainArgs()))
}

export function buildCreateBeadArgs(opts: {
  title: string
  description?: string
  type?: string
  parent?: string
  labels?: string[]
}): string[] {
  const args = ['create', '--title', opts.title, '--silent']
  if (opts.description) args.push('-d', opts.description)
  if (opts.type) args.push('--type', opts.type)
  if (opts.parent) args.push('--parent', opts.parent)
  if (opts.labels && opts.labels.length > 0)
    args.push('--labels', opts.labels.join(','))
  return args
}

async function createBead(
  projectId: string,
  opts: {
    title: string
    description?: string
    type?: string
    parent?: string
    labels?: string[]
  },
): Promise<string> {
  const dir = await resolveDir(projectId)
  const out = await bdRaw(dir, buildCreateBeadArgs(opts))
  return out.trim()
}

async function addComment(
  projectId: string,
  id: string,
  text: string,
): Promise<void> {
  const dir = await resolveDir(projectId)
  await bdRaw(dir, ['comment', id, text])
}

async function enableEventsJournal(projectId: string): Promise<void> {
  const dir = await resolveDir(projectId)
  await bdRaw(dir, ['config', 'set', 'events-journal', 'true'])
}

/** One page of the events journal after `since`. Truncation can come with a non-zero exit, and a disabled journal exits 0 with a note on stderr. */
async function tailEvents(
  projectId: string,
  since: number,
  limit: number,
): Promise<TailEventsResult> {
  const dir = await resolveDir(projectId)
  const run = await bdExec(dir, tailArgs(since, { limit }))
  const disabled = run.stderr.includes(JOURNAL_DISABLED_MARKER)
  const result = tailResult(run.stdout, disabled)
  if (run.code !== 0 && !result.truncated && !disabled) throw bdFailure(run)
  return result
}

export const bdAdapter: BdAdapter = {
  discoverProjects,
  listBeads,
  getBeadDetail,
  getProjectKnowledge,
  updateBeadStatus,
  closeBead,
  claimBead,
  readyExplain,
  addRelation,
  removeRelation,
  listGates,
  resolveGate,
  reclaimBead,
  unclaimBead,
  getConfig,
  updateBead,
  deferBead,
  undeferBead,
  previewDeleteBead,
  deleteBead,
  createBead,
  addComment,
  enableEventsJournal,
  tailEvents,
}

export {
  discoverProjects,
  listBeads,
  getBeadDetail,
  getProjectKnowledge,
  updateBeadStatus,
  closeBead,
  claimBead,
  readyExplain,
  addRelation,
  removeRelation,
  buildCloseBeadArgs,
  updateBead,
  buildUpdateBeadArgs,
  buildListBeadsArgs,
  buildDeferBeadArgs,
  buildUndeferBeadArgs,
  deferBead,
  undeferBead,
  listGates,
  resolveGate,
  reclaimBead,
  unclaimBead,
  getConfig,
  previewDeleteBead,
  deleteBead,
  buildPreviewDeleteBeadArgs,
  buildDeleteBeadArgs,
  createBead,
  addComment,
  enableEventsJournal,
  tailEvents,
  resolveDir,
  counts,
}
