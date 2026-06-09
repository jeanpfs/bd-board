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

export interface Bead {
  id: string
  title: string
  description?: string
  acceptance_criteria?: string
  status: RawStatus
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
  children?: string[]
  childBeads?: Bead[]
}

export interface RelatedBead {
  id: string
  title: string
  status: RawStatus
  issue_type: string
  dependency_type: string
}

export interface BeadDetail extends Bead {
  dependencies?: RelatedBead[]
  comments?: Comment[]
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
  name: string
  dir: string
  database: string
  counts: ProjectCounts
}

export const COLUMNS: { key: BeadColumn; label: string }[] = [
  { key: 'open', label: 'Open' },
  { key: 'in_progress', label: 'In Progress' },
  { key: 'blocked', label: 'Blocked' },
  { key: 'closed', label: 'Closed' },
]

export function mapStatus(raw: string): {
  column: BeadColumn
  badge?: { label: string; tone: 'warning' | 'muted' | 'info' }
} {
  switch (raw) {
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
    default:
      return { column: 'open' }
  }
}

export function isEpic(b: { issue_type: string }): boolean {
  return b.issue_type === 'epic'
}
