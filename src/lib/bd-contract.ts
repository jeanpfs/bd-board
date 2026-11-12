import type { RelationKind, RemovableRelationKind } from './relations.ts'
import type { TailEventsResult } from './events.ts'
import type {
  LinearStatus,
  LinearSyncOptions,
  LinearSyncResult,
} from './linear.ts'
import type {
  BulkPatch,
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
  /** `bd stale --days N --json`: beads untouched for at least N days, mapped like other beads. */
  staleBeads: (projectId: string, days: number) => Promise<Bead[]>
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
  /** `bd query <expr> --json --limit 0 --all`: beads matching the expression. */
  queryBeads: (projectId: string, expr: string) => Promise<Bead[]>
  /** `bd query <expr> --parse-only`; throws with bd's parse error. */
  validateQuery: (projectId: string, expr: string) => Promise<void>
  /** `bd kv get <key> --json`; null when the key is unset. */
  kvGet: (projectId: string, key: string) => Promise<string | null>
  /** `bd kv set <key> <value> --json`. */
  kvSet: (projectId: string, key: string, value: string) => Promise<void>
  /** `bd linear status --json`: connection state and sync counts, no credentials. */
  linearStatus: (projectId: string) => Promise<LinearStatus>
  /** `bd linear sync` with the given direction and flags; output is returned even on failure. */
  linearSync: (
    projectId: string,
    opts: LinearSyncOptions,
  ) => Promise<LinearSyncResult>
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
  /** One `bd update` over many ids; `patch` applies to every one. */
  updateMany: (
    projectId: string,
    ids: string[],
    patch: BulkPatch,
  ) => Promise<void>
  /** One `bd close` over many ids; `force` overrides the close policy per bead. */
  closeMany: (
    projectId: string,
    ids: string[],
    opts: { reason?: string; force?: boolean },
  ) => Promise<void>
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
  /** `bd events tail --since <since> --limit <limit>`: one page of the journal, oldest first. */
  tailEvents: (
    projectId: string,
    since: number,
    limit: number,
  ) => Promise<TailEventsResult>
}
