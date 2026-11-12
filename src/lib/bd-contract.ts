import type { RelationKind, RemovableRelationKind } from './relations.ts'
import type { TailEventsResult } from './events.ts'
import type {
  Bead,
  BeadDetail,
  BeadUpdate,
  DeletePlan,
  Project,
  ProjectKnowledge,
  ReadyExplain,
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
  /** `bd update --claim`: atomic; fails when another actor holds the bead. */
  claimBead: (projectId: string, id: string, actor?: string) => Promise<void>
  /** `bd gate list --all --json`: gate beads, mapped like other beads. */
  listGates: (projectId: string) => Promise<Bead[]>
  /** `bd gate resolve`: closes the gate, unblocking what waits on it. */
  resolveGate: (projectId: string, id: string) => Promise<void>
  /** `bd reclaim --id`: only leases already expired. Resolves to the reclaimed count. */
  reclaimBead: (projectId: string, id: string) => Promise<number>
  /** `bd unclaim`; `force` releases another actor's claim. */
  unclaimBead: (
    projectId: string,
    id: string,
    force: boolean,
    actor?: string,
  ) => Promise<void>
  /** `bd config get <key> --json`; empty string when unset. */
  getConfig: (projectId: string, key: string) => Promise<string>
  /** `bd config set <key> <value>`; an empty value clears the key. */
  setConfig: (projectId: string, key: string, value: string) => Promise<void>
  /** Raw `bd ready --explain --json`; shape it with `parseReadyExplain`. */
  readyExplain: (projectId: string) => Promise<ReadyExplain>
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
  /** `bd events tail --since <since> --limit <limit>`: one page of the journal, oldest first. */
  tailEvents: (
    projectId: string,
    since: number,
    limit: number,
  ) => Promise<TailEventsResult>
}
