import { execFile } from 'node:child_process'
import { promisify } from 'node:util'
import * as fs from 'node:fs/promises'
import * as path from 'node:path'
import * as os from 'node:os'
import type { BdAdapter } from './bd-contract.ts'
import type {
  Bead,
  BeadDetail,
  BeadLink,
  BeadUpdate,
  Comment,
  Project,
  ProjectComment,
  ProjectCounts,
  ProjectKnowledge,
  ProjectKnowledgeEntry,
  RelatedBead,
} from './types.ts'
import { parseKnowledgeCommentText } from './knowledge.ts'

const execFileAsync = promisify(execFile)

const BD_PRIMARY = process.env['BD_BIN'] ?? 'bd'
const BD_FALLBACK = '/opt/homebrew/bin/bd'
const MAX_BUFFER = 64 * 1024 * 1024
export const COMMENTS_LIMIT = 250
export const KNOWLEDGE_LIMIT = 500

let dirCache: Map<string, string> | null = null

async function bdRaw(dir: string, args: string[]): Promise<string> {
  const run = async (bin: string) =>
    execFileAsync(bin, ['-C', dir, ...args], { maxBuffer: MAX_BUFFER })

  try {
    const { stdout } = await run(BD_PRIMARY)
    return stdout
  } catch (err: unknown) {
    const code = (err as NodeJS.ErrnoException).code
    if (code === 'ENOENT') {
      const { stdout } = await run(BD_FALLBACK)
      return stdout
    }
    const stderr = (err as { stderr?: string }).stderr ?? String(err)
    throw new Error(`bd failed in ${dir}: ${stderr}`)
  }
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

function buildCounts(
  rows: { status: string; c: string | number }[],
): ProjectCounts {
  const totals: ProjectCounts = {
    open: 0,
    in_progress: 0,
    blocked: 0,
    closed: 0,
    deferred: 0,
    total: 0,
  }
  for (const row of rows) {
    const n = Number(row.c)
    totals.total += n
    switch (row.status) {
      case 'open':
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
    }
  }
  return totals
}

export function buildCountsFromGroups(
  groups: { group: string; count: number }[],
): ProjectCounts {
  return buildCounts(groups.map((g) => ({ status: g.group, c: g.count })))
}

async function counts(dir: string): Promise<ProjectCounts> {
  try {
    const result = await bdJson<{
      groups?: { group: string; count: number }[]
    }>(dir, ['count', '--by-status', '--json'])
    return buildCountsFromGroups(result.groups ?? [])
  } catch {
    return {
      open: 0,
      in_progress: 0,
      blocked: 0,
      closed: 0,
      deferred: 0,
      total: 0,
    }
  }
}

export function expandHome(p: string): string {
  if (p === '~') return os.homedir()
  if (p.startsWith('~/')) return path.join(os.homedir(), p.slice(2))
  return p
}

async function resolveRoots(): Promise<string[]> {
  const env = process.env['BD_ROOTS']
  const roots = env
    ? splitConfiguredRoots(env, path.delimiter)
    : [path.join(os.homedir(), 'Code')]
  return roots.map(expandHome)
}

export function splitConfiguredRoots(raw: string, delimiter: string): string[] {
  return raw.split(delimiter).filter(Boolean)
}

async function discoverProjects(): Promise<Project[]> {
  const roots = await resolveRoots()
  const results: Project[] = []

  for (const root of roots) {
    let entries: string[]
    try {
      const dirents = await fs.readdir(root, { withFileTypes: true })
      entries = dirents.filter((d) => d.isDirectory()).map((d) => d.name)
    } catch {
      continue
    }

    await Promise.all(
      entries.map(async (name) => {
        const dir = path.join(root, name)
        const metaPath = path.join(dir, '.beads', 'metadata.json')
        try {
          const raw = await fs.readFile(metaPath, 'utf-8')
          const meta = JSON.parse(raw) as { dolt_database?: string }
          const database = meta.dolt_database
          if (!database) return
          const projectCounts = await counts(dir)
          results.push({ name: database, dir, database, counts: projectCounts })
        } catch {
          // skip dirs without valid metadata
        }
      }),
    )
  }

  return results.sort((a, b) => {
    const diff = b.counts.total - a.counts.total
    return diff !== 0 ? diff : a.name.localeCompare(b.name)
  })
}

async function getDirMap(): Promise<Map<string, string>> {
  if (dirCache) return dirCache
  const projects = await discoverProjects()
  dirCache = new Map(projects.map((p) => [p.database, p.dir]))
  return dirCache
}

async function resolveDir(database: string): Promise<string> {
  const map = await getDirMap()
  const dir = map.get(database)
  if (!dir)
    throw new Error(
      `Unknown database: ${database}. Run discoverProjects first.`,
    )
  return dir
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

export function buildBeadGraph(rawBeads: Record<string, unknown>[]): Bead[] {
  const beads = rawBeads.map(mapRawBead)
  const knownIds = new Set(beads.map((b) => b.id))
  const edges = collectEdges(rawBeads, knownIds)

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

function mapRawBead(raw: Record<string, unknown>): Bead {
  return {
    id: raw['id'] as string,
    title: raw['title'] as string,
    description: raw['description'] as string | undefined,
    acceptance_criteria: raw['acceptance_criteria'] as string | undefined,
    design: raw['design'] as string | undefined,
    notes: raw['notes'] as string | undefined,
    status: raw['status'] as string,
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

async function listBeads(database: string): Promise<Bead[]> {
  const dir = await resolveDir(database)
  const raw = await bdJson<Record<string, unknown>[]>(dir, [
    'list',
    '--all',
    '--json',
  ])
  return buildBeadGraph(raw)
}

async function getBeadDetail(
  database: string,
  id: string,
): Promise<BeadDetail> {
  const dir = await resolveDir(database)

  const [rawArr, rawComments] = await Promise.all([
    bdJson<Record<string, unknown>[]>(dir, ['show', id, '--json']),
    bdJson<Record<string, unknown>[]>(dir, ['comments', id, '--json']).catch(
      () => [] as Record<string, unknown>[],
    ),
  ])

  const raw = rawArr[0] ?? {}
  const bead = mapRawBead(raw)

  const rawDeps = Array.isArray(raw['dependencies'])
    ? (raw['dependencies'] as Record<string, unknown>[])
    : []

  const dependencies: RelatedBead[] = rawDeps.map((d) => ({
    id: String(d['id'] ?? ''),
    title: String(d['title'] ?? ''),
    status: String(d['status'] ?? 'open'),
    issue_type: String(d['issue_type'] ?? 'task'),
    dependency_type: String(d['dependency_type'] ?? ''),
  }))

  const comments: Comment[] = rawComments.map(mapComment)

  return { ...bead, dependencies, comments }
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
  database: string,
): Promise<ProjectKnowledge> {
  const dir = await resolveDir(database)
  try {
    const issues = await bdJsonLines<Record<string, unknown>>(dir, ['export'])
    return buildProjectKnowledge(issues)
  } catch {
    return { comments: [], knowledge: [] }
  }
}

async function updateBeadStatus(
  database: string,
  id: string,
  status: string,
): Promise<void> {
  const dir = await resolveDir(database)
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
  database: string,
  id: string,
  opts: BeadUpdate,
): Promise<void> {
  const dir = await resolveDir(database)
  const existing =
    opts.labels !== undefined ? await getBeadDetail(database, id) : undefined
  const args = buildUpdateBeadArgs(id, opts, existing?.labels ?? [])
  if (args.length <= 2) return
  await bdRaw(dir, args)
}

async function previewDeleteBead(
  database: string,
  id: string,
): Promise<string> {
  const dir = await resolveDir(database)
  const out = await bdRaw(dir, buildPreviewDeleteBeadArgs(id))
  return out.trim()
}

async function deleteBead(database: string, id: string): Promise<void> {
  const dir = await resolveDir(database)
  try {
    await bdRaw(dir, buildDeleteBeadArgs(id))
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err)
    throw new Error(`Unable to delete bead. ${message}`)
  }
}

function buildPreviewDeleteBeadArgs(id: string): string[] {
  return ['delete', id, '--cascade']
}

function buildDeleteBeadArgs(id: string): string[] {
  return ['delete', id, '--cascade', '--force']
}

async function createBead(
  database: string,
  opts: { title: string; description?: string; type?: string; parent?: string },
): Promise<string> {
  const dir = await resolveDir(database)
  const args = ['create', '--title', opts.title, '--silent']
  if (opts.description) args.push('-d', opts.description)
  if (opts.type) args.push('--type', opts.type)
  if (opts.parent) args.push('--parent', opts.parent)
  const out = await bdRaw(dir, args)
  return out.trim()
}

async function addComment(
  database: string,
  id: string,
  text: string,
): Promise<void> {
  const dir = await resolveDir(database)
  await bdRaw(dir, ['comment', id, text])
}

export const bdAdapter: BdAdapter = {
  discoverProjects,
  listBeads,
  getBeadDetail,
  getProjectKnowledge,
  updateBeadStatus,
  updateBead,
  previewDeleteBead,
  deleteBead,
  createBead,
  addComment,
}

export {
  discoverProjects,
  listBeads,
  getBeadDetail,
  getProjectKnowledge,
  updateBeadStatus,
  updateBead,
  buildUpdateBeadArgs,
  previewDeleteBead,
  deleteBead,
  buildPreviewDeleteBeadArgs,
  buildDeleteBeadArgs,
  createBead,
  addComment,
  resolveDir,
  counts,
}
