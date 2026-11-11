import type { RelationKind, RemovableRelationKind } from './relations.ts'
import type {
  Bead,
  BeadDetail,
  BeadUpdate,
  DeletePlan,
  Project,
  ProjectKnowledge,
} from './types.ts'

export interface BdAdapter {
  discoverProjects: () => Promise<Project[]>
  listBeads: (projectId: string) => Promise<Bead[]>
  getBeadDetail: (projectId: string, id: string) => Promise<BeadDetail>
  getProjectKnowledge: (projectId: string) => Promise<ProjectKnowledge>
  updateBeadStatus: (
    projectId: string,
    id: string,
    status: string,
  ) => Promise<void>
  /** `bd close`; `force` overrides the close policy (open children, blockers). */
  closeBead: (
    projectId: string,
    id: string,
    opts: { reason?: string; force?: boolean },
  ) => Promise<void>
  /** `bd dep add`, `bd dep relate`, `bd duplicate` or `bd supersede` from `id` to `target`. */
  addRelation: (
    projectId: string,
    id: string,
    kind: RelationKind,
    target: string,
  ) => Promise<void>
  /** Removes an edge added by `addRelation`; only blocked-by, blocks and relates-to. */
  removeRelation: (
    projectId: string,
    id: string,
    kind: RemovableRelationKind,
    target: string,
  ) => Promise<void>
  updateBead: (projectId: string, id: string, opts: BeadUpdate) => Promise<void>
  /** `bd defer`; without `until` the bead is deferred indefinitely. */
  deferBead: (projectId: string, id: string, until?: string) => Promise<void>
  undeferBead: (projectId: string, id: string) => Promise<void>
  previewDeleteBead: (projectId: string, id: string) => Promise<DeletePlan>
  deleteBead: (projectId: string, id: string) => Promise<void>
  createBead: (
    projectId: string,
    opts: {
      title: string
      description?: string
      type?: string
      parent?: string
      labels?: string[]
    },
  ) => Promise<string>
  addComment: (projectId: string, id: string, text: string) => Promise<void>
  enableEventsJournal: (projectId: string) => Promise<void>
}
