import type { MigrationGate } from './migration-gate.ts'

export type BeadColumn = 'open' | 'in_progress' | 'blocked' | 'closed'

export type RawStatus =
  | 'open'
  | 'in_progress'
  | 'blocked'
  | 'deferred'
  | 'closed'
  | 'pinned'
  | 'hooked'
  | (string & {})

export interface Comment {
  id: string
  author?: string
  text: string
  created_at?: string
}

export type KnowledgeType =
  | 'learned'
  | 'decision'
  | 'fact'
  | 'pattern'
  | 'investigation'
  | 'must-check'
  | 'deviation'

export interface ProjectComment extends Comment {
  bead_id: string
  bead_title?: string
  knowledge_type?: KnowledgeType
}

export interface ProjectKnowledgeEntry extends ProjectComment {
  type: KnowledgeType
  content: string
}

export interface ProjectKnowledge {
  comments: ProjectComment[]
  knowledge: ProjectKnowledgeEntry[]
}

export type LinkDirection = 'outgoing' | 'incoming'

/**
 * One dependency edge as seen from a single bead. `outgoing` means this bead is
 * the `issue_id` of the bd edge, `incoming` means it is the `depends_on_id`.
 */
export interface BeadLink {
  id: string
  type: string
  direction: LinkDirection
}

export interface Bead {
  id: string
  title: string
  description?: string
  acceptance_criteria?: string
  design?: string
  notes?: string
  status: RawStatus
  /** Category of a custom status (`bd statuses`); unset for built-ins. */
  status_category?: StatusCategory
  priority: number
  issue_type: string
  assignee?: string
  owner?: string
  created_at?: string
  updated_at?: string
  closed_at?: string
  labels?: string[]
  parent?: string
  comment_count?: number
  dependency_count?: number
  dependent_count?: number
  due_at?: string
  defer_until?: string
  estimated_minutes?: number
  started_at?: string
  lease_expires_at?: string
  heartbeat_at?: string
  close_reason?: string
  external_ref?: string
  created_by?: string
  children?: string[]
  childBeads?: Bead[]
  links?: BeadLink[]
}

/** `bd ready --explain` row: a ready bead plus bd's reason and the blockers it outlived. */
export interface ReadyRow extends Bead {
  reason: string
  /** Ids of blockers that were closed; empty when it never had any. */
  resolved_blockers: string[]
}

export interface BlockerRef {
  id: string
  title: string
  status: string
  priority: number
}

export interface BlockedRow extends Bead {
  blocked_by: BlockerRef[]
}

export interface ReadyExplain {
  ready: ReadyRow[]
  blocked: BlockedRow[]
}

export interface RelatedBead {
  id: string
  title: string
  status: RawStatus
  issue_type: string
  dependency_type: string
  due_at?: string
}

export interface BeadDetail extends Bead {
  dependencies?: RelatedBead[]
  dependents?: RelatedBead[]
  comments?: Comment[]
}

export interface BeadUpdate {
  title?: string
  description?: string
  acceptance_criteria?: string
  design?: string
  notes?: string
  priority?: number
  issue_type?: string
  assignee?: string
  labels?: string[]
  due?: string
  estimate?: number
}

/** Fields applied to every selected bead by one `bd update`. Empty string clears. */
export interface BulkPatch {
  status?: string
  priority?: number
  assignee?: string
  due?: string
  addLabels?: string[]
}

export interface ProjectCounts {
  open: number
  in_progress: number
  blocked: number
  closed: number
  deferred: number
  total: number
}

export interface Project {
  id: string
  name: string
  dir: string
  beadsPath: string
  prefix: string | null
  external: boolean
  missing: boolean
  error: string | null
  /** Pending schema migration bd refuses to apply on its own. */
  migration: MigrationGate | null
  counts: ProjectCounts
}

/** What `bd delete` will remove, computed before asking for confirmation. */
export interface DeletePlan {
  /** The bead and its parent-child descendants, in deletion order. */
  ids: string[]
  /** bd's own preview of the deletion. */
  preview: string
  /** Beads outside the deletion that depend on it; kept, link removed. */
  unlinked: { id: string; title: string; type: string }[]
}

export type AddProjectOutcome =
  | { kind: 'registered'; project: Project }
  | { kind: 'needsInit'; path: string; suggestedPrefix: string }

export const COLUMNS: { key: BeadColumn; label: string }[] = [
  { key: 'open', label: 'Open' },
  { key: 'in_progress', label: 'In Progress' },
  { key: 'blocked', label: 'Blocked' },
  { key: 'closed', label: 'Closed' },
]

export type StatusCategory =
  | 'active'
  | 'wip'
  | 'done'
  | 'frozen'
  | 'unspecified'

export const BUILT_IN_STATUSES: Record<string, true> = {
  open: true,
  in_progress: true,
  blocked: true,
  deferred: true,
  closed: true,
  pinned: true,
  hooked: true,
}

/** Board column a custom status lands in, by its bd category. */
export const CATEGORY_COLUMN: Record<StatusCategory, BeadColumn> = {
  active: 'open',
  wip: 'in_progress',
  done: 'closed',
  frozen: 'open',
  unspecified: 'open',
}

/** `in_review` → `In review`. */
export function statusLabel(raw: string): string {
  const words = raw.replace(/[_-]+/g, ' ').trim()
  return words.charAt(0).toUpperCase() + words.slice(1)
}

export function mapStatus(bead: {
  status: string
  status_category?: StatusCategory
}): {
  column: BeadColumn
  badge?: { label: string; tone: 'warning' | 'muted' | 'info' }
} {
  switch (bead.status) {
    case 'open':
      return { column: 'open' }
    case 'in_progress':
      return { column: 'in_progress' }
    case 'blocked':
      return { column: 'blocked' }
    case 'closed':
      return { column: 'closed' }
    case 'deferred':
      return { column: 'open', badge: { label: 'Deferred', tone: 'muted' } }
    case 'hooked':
      return { column: 'in_progress', badge: { label: 'Hooked', tone: 'info' } }
    case 'pinned':
      return { column: 'open', badge: { label: 'Pinned', tone: 'warning' } }
    default: {
      // Custom status: place it by category and always name it on the card,
      // so it never looks like a plain open bead.
      const category = bead.status_category ?? 'unspecified'
      return {
        column: CATEGORY_COLUMN[category],
        badge: {
          label: statusLabel(bead.status),
          tone:
            category === 'frozen' || category === 'unspecified'
              ? 'muted'
              : 'info',
        },
      }
    }
  }
}

/** The bead's status in running text: `in progress`, `deferred`, `in review`. */
export function statusText(bead: {
  status: string
  status_category?: StatusCategory
}): string {
  const { column, badge } = mapStatus(bead)
  const label =
    badge?.label ?? COLUMNS.find((c) => c.key === column)?.label ?? column
  return label.toLowerCase()
}

export function isEpic(b: { issue_type: string }): boolean {
  return b.issue_type === 'epic'
}

export function groupBeadLinks(links: BeadLink[] = []): {
  blockedBy: string[]
  blocking: string[]
  related: BeadLink[]
} {
  const blockedBy: string[] = []
  const blocking: string[] = []
  const related: BeadLink[] = []

  for (const link of links) {
    if (link.type === 'parent-child') continue
    if (link.type === 'blocks') {
      if (link.direction === 'outgoing') blockedBy.push(link.id)
      else blocking.push(link.id)
      continue
    }
    related.push(link)
  }

  return { blockedBy, blocking, related }
}

export type BeadFeedMessage =
  | { type: 'live'; seq: number }
  | { type: 'change'; seq: number; issueIds: string[] }
  | { type: 'disabled' }
  | { type: 'unsupported'; message: string }
  | { type: 'error'; message: string }
export type BeadFeedStatus =
  | 'connecting'
  | 'live'
  | 'disabled'
  | 'unsupported'
  | 'error'
