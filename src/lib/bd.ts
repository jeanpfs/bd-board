import { execFile } from 'node:child_process'
import { promisify } from 'node:util'
import * as fs from 'node:fs/promises'
import * as path from 'node:path'
import * as os from 'node:os'
import type { Bead, BeadDetail, Comment, Project, ProjectCounts, RelatedBead } from './types.ts'

const execFileAsync = promisify(execFile)

const BD_PRIMARY = process.env['BD_BIN'] ?? 'bd'
const BD_FALLBACK = '/opt/homebrew/bin/bd'
const MAX_BUFFER = 64 * 1024 * 1024

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

function buildCounts(rows: { status: string; c: string | number }[]): ProjectCounts {
  const counts: ProjectCounts = { open: 0, in_progress: 0, blocked: 0, closed: 0, deferred: 0, total: 0 }
  for (const row of rows) {
    const n = Number(row.c)
    counts.total += n
    switch (row.status) {
      case 'open': counts.open += n; break
      case 'in_progress': case 'hooked': counts.in_progress += n; break
      case 'blocked': counts.blocked += n; break
      case 'closed': counts.closed += n; break
      case 'deferred': counts.deferred += n; break
    }
  }
  return counts
}

async function counts(dir: string): Promise<ProjectCounts> {
  try {
    const rows = await bdJson<{ status: string; c: string | number }[]>(
      dir,
      ['sql', '--json', 'SELECT status, COUNT(*) AS c FROM issues GROUP BY status'],
    )
    return buildCounts(rows)
  } catch {
    return { open: 0, in_progress: 0, blocked: 0, closed: 0, deferred: 0, total: 0 }
  }
}

async function resolveRoots(): Promise<string[]> {
  const env = process.env['BD_ROOTS']
  if (env) return env.split(':').filter(Boolean)
  return [path.join(os.homedir(), 'Code')]
}

async function discoverProjects(): Promise<Project[]> {
  const roots = await resolveRoots()
  const results: Project[] = []

  for (const root of roots) {
    let entries: string[]
    try {
      const dirents = await fs.readdir(root, { withFileTypes: true })
      entries = dirents.filter(d => d.isDirectory()).map(d => d.name)
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
  dirCache = new Map(projects.map(p => [p.database, p.dir]))
  return dirCache
}

async function resolveDir(database: string): Promise<string> {
  const map = await getDirMap()
  const dir = map.get(database)
  if (!dir) throw new Error(`Unknown database: ${database}. Run discoverProjects first.`)
  return dir
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

  const beadById = new Map(beads.map(b => [b.id, b]))

  return beads.map(b => {
    const childIds = childMap.get(b.id)
    if (!childIds?.length) return b
    return {
      ...b,
      children: childIds,
      childBeads: childIds.map(id => beadById.get(id)).filter((x): x is Bead => x !== undefined),
    }
  })
}

function mapRawBead(raw: Record<string, unknown>): Bead {
  return {
    id: raw['id'] as string,
    title: raw['title'] as string,
    description: raw['description'] as string | undefined,
    acceptance_criteria: raw['acceptance_criteria'] as string | undefined,
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
    comment_count: raw['comment_count'] !== undefined ? Number(raw['comment_count']) : undefined,
    dependency_count: raw['dependency_count'] !== undefined ? Number(raw['dependency_count']) : undefined,
    dependent_count: raw['dependent_count'] !== undefined ? Number(raw['dependent_count']) : undefined,
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

async function listBeads(database: string): Promise<Bead[]> {
  const dir = await resolveDir(database)
  const raw = await bdJson<Record<string, unknown>[]>(dir, ['list', '--all', '--json'])
  const beads = raw.map(mapRawBead)
  return deriveChildren(beads)
}

async function getBeadDetail(database: string, id: string): Promise<BeadDetail> {
  const dir = await resolveDir(database)

  const [rawArr, rawComments] = await Promise.all([
    bdJson<Record<string, unknown>[]>(dir, ['show', id, '--json']),
    bdJson<Record<string, unknown>[]>(dir, ['comments', id, '--json']).catch(() => [] as Record<string, unknown>[]),
  ])

  const raw = rawArr[0] ?? {}
  const bead = mapRawBead(raw)

  const rawDeps = Array.isArray(raw['dependencies'])
    ? (raw['dependencies'] as Record<string, unknown>[])
    : []

  const dependencies: RelatedBead[] = rawDeps.map(d => ({
    id: String(d['id'] ?? ''),
    title: String(d['title'] ?? ''),
    status: String(d['status'] ?? 'open'),
    issue_type: String(d['issue_type'] ?? 'task'),
    dependency_type: String(d['dependency_type'] ?? ''),
  }))

  const comments: Comment[] = (rawComments).map(mapComment)

  return { ...bead, dependencies, comments }
}

async function updateBeadStatus(database: string, id: string, status: string): Promise<void> {
  const dir = await resolveDir(database)
  await bdRaw(dir, ['update', id, '--status', status])
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

async function addComment(database: string, id: string, text: string): Promise<void> {
  const dir = await resolveDir(database)
  await bdRaw(dir, ['comment', id, text])
}

export {
  discoverProjects,
  listBeads,
  getBeadDetail,
  updateBeadStatus,
  createBead,
  addComment,
  resolveDir,
  counts,
}
