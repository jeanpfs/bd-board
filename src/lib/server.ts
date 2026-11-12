import { Channel, invoke, isTauri } from '@tauri-apps/api/core'
import type { RelationKind, RemovableRelationKind } from './relations.ts'
import { createServerFn } from '@tanstack/react-start'

import { bdAdapter } from './bd.ts'
import {
  parseRelationInput,
  parseRemoveRelationInput,
  parseBeadInput,
  parseClaimInput,
  parseConfigKeyInput,
  parseUnclaimInput,
  parseCloseBeadInput,
  parseCommentInput,
  parseCreateBeadInput,
  parseDeferInput,
  parseProjectInput,
  parseStatusUpdateInput,
  parseUpdateBeadInput,
} from './server-validation.ts'
import { parseReadyExplain } from './ready.ts'
import { toErrorMessage } from './utils.ts'

import type {
  AddProjectOutcome,
  Bead,
  BeadFeedMessage,
  BeadDetail,
  BeadUpdate,
  DeletePlan,
  Project,
  ReadyExplain,
  ProjectKnowledge,
} from './types.ts'

export function isDesktopApp(): boolean {
  return typeof window !== 'undefined' && isTauri()
}

const webGetProjects = createServerFn({ method: 'GET' }).handler(() =>
  bdAdapter.discoverProjects(),
)

const webGetBeads = createServerFn({ method: 'GET' })
  .validator(parseProjectInput)
  .handler(({ data }) => bdAdapter.listBeads(data.project))

const webGetBeadDetail = createServerFn({ method: 'GET' })
  .validator(parseBeadInput)
  .handler(({ data }) => bdAdapter.getBeadDetail(data.project, data.id))

const webGetProjectKnowledge = createServerFn({ method: 'GET' })
  .validator(parseProjectInput)
  .handler(({ data }) => bdAdapter.getProjectKnowledge(data.project))

const webUpdateBeadStatus = createServerFn({ method: 'POST' })
  .validator(parseStatusUpdateInput)
  .handler(async ({ data }) => {
    await bdAdapter.updateBeadStatus(data.project, data.id, data.status)
    return { ok: true as const }
  })

const webCloseBead = createServerFn({ method: 'POST' })
  .validator(parseCloseBeadInput)
  .handler(async ({ data }) => {
    await bdAdapter.closeBead(data.project, data.id, {
      reason: data.reason,
      force: data.force,
    })
    return { ok: true as const }
  })

const webClaimBead = createServerFn({ method: 'POST' })
  .validator(parseClaimInput)
  .handler(async ({ data }) => {
    await bdAdapter.claimBead(data.project, data.id, data.actor)
    return { ok: true as const }
  })

const webListGates = createServerFn({ method: 'POST' })
  .validator(parseProjectInput)
  .handler(async ({ data }) => bdAdapter.listGates(data.project))

const webResolveGate = createServerFn({ method: 'POST' })
  .validator(parseBeadInput)
  .handler(async ({ data }) => {
    await bdAdapter.resolveGate(data.project, data.id)
    return { ok: true as const }
  })

const webReclaimBead = createServerFn({ method: 'POST' })
  .validator(parseBeadInput)
  .handler(async ({ data }) => {
    await bdAdapter.reclaimBead(data.project, data.id)
    return { ok: true as const }
  })

const webUnclaimBead = createServerFn({ method: 'POST' })
  .validator(parseUnclaimInput)
  .handler(async ({ data }) => {
    await bdAdapter.unclaimBead(data.project, data.id, data.force, data.actor)
    return { ok: true as const }
  })

const webGetConfig = createServerFn({ method: 'POST' })
  .validator(parseConfigKeyInput)
  .handler(async ({ data }) => bdAdapter.getConfig(data.project, data.key))

const webReadyExplain = createServerFn({ method: 'POST' })
  .validator(parseProjectInput)
  .handler(async ({ data }) => bdAdapter.readyExplain(data.project))

const webAddRelation = createServerFn({ method: 'POST' })
  .validator(parseRelationInput)
  .handler(async ({ data }) => {
    await bdAdapter.addRelation(data.project, data.id, data.kind, data.target)
    return { ok: true as const }
  })

const webRemoveRelation = createServerFn({ method: 'POST' })
  .validator(parseRemoveRelationInput)
  .handler(async ({ data }) => {
    await bdAdapter.removeRelation(
      data.project,
      data.id,
      data.kind,
      data.target,
    )
    return { ok: true as const }
  })

const webUpdateBead = createServerFn({ method: 'POST' })
  .validator(parseUpdateBeadInput)
  .handler(async ({ data }) => {
    await bdAdapter.updateBead(data.project, data.id, data.update)
    return { ok: true as const }
  })

const webDeferBead = createServerFn({ method: 'POST' })
  .validator(parseDeferInput)
  .handler(async ({ data }) => {
    await bdAdapter.deferBead(data.project, data.id, data.until)
    return { ok: true as const }
  })

const webUndeferBead = createServerFn({ method: 'POST' })
  .validator(parseBeadInput)
  .handler(async ({ data }) => {
    await bdAdapter.undeferBead(data.project, data.id)
    return { ok: true as const }
  })

const webPreviewDeleteBead = createServerFn({ method: 'POST' })
  .validator(parseBeadInput)
  .handler(({ data }) => bdAdapter.previewDeleteBead(data.project, data.id))

const webDeleteBead = createServerFn({ method: 'POST' })
  .validator(parseBeadInput)
  .handler(async ({ data }) => {
    await bdAdapter.deleteBead(data.project, data.id)
    return { ok: true as const }
  })

const webCreateBead = createServerFn({ method: 'POST' })
  .validator(parseCreateBeadInput)
  .handler(async ({ data }) => {
    const id = await bdAdapter.createBead(data.project, {
      title: data.title,
      description: data.description,
      type: data.type,
      parent: data.parent,
      labels: data.labels,
    })
    return { id }
  })

const webAddComment = createServerFn({ method: 'POST' })
  .validator(parseCommentInput)
  .handler(async ({ data }) => {
    await bdAdapter.addComment(data.project, data.id, data.text)
    return { ok: true as const }
  })

export const webEnableEventsJournal = createServerFn({ method: 'POST' })
  .validator(parseProjectInput)
  .handler(async ({ data }) => {
    await bdAdapter.enableEventsJournal(data.project)
    return { ok: true as const }
  })

export async function getProjects(): Promise<Project[]> {
  if (isDesktopApp()) return invoke<Project[]>('list_projects')
  return webGetProjects()
}

export async function getBeads({
  data,
}: {
  data: { project: string }
}): Promise<Bead[]> {
  if (isDesktopApp())
    return invoke<Bead[]>('list_beads', { projectId: data.project })
  return webGetBeads({ data })
}

export async function getBeadDetailFn({
  data,
}: {
  data: { project: string; id: string }
}): Promise<BeadDetail> {
  if (isDesktopApp())
    return invoke<BeadDetail>('get_bead_detail', {
      projectId: data.project,
      id: data.id,
    })
  return webGetBeadDetail({ data })
}

export async function getProjectKnowledgeFn({
  data,
}: {
  data: { project: string }
}): Promise<ProjectKnowledge> {
  if (isDesktopApp())
    return invoke<ProjectKnowledge>('get_project_knowledge', {
      projectId: data.project,
    })
  return webGetProjectKnowledge({ data })
}

export async function updateBeadStatusFn({
  data,
}: {
  data: { project: string; id: string; status: string }
}): Promise<{ ok: true }> {
  if (isDesktopApp()) {
    await invoke('update_bead_status', {
      projectId: data.project,
      id: data.id,
      status: data.status,
    })
    return { ok: true }
  }
  return webUpdateBeadStatus({ data })
}

export async function closeBeadFn({
  data,
}: {
  data: { project: string; id: string; reason?: string; force?: boolean }
}): Promise<{ ok: true }> {
  if (isDesktopApp()) {
    await invoke('close_bead', {
      projectId: data.project,
      id: data.id,
      reason: data.reason,
      force: data.force ?? false,
    })
    return { ok: true }
  }
  return webCloseBead({ data })
}

export async function claimBeadFn({
  data,
}: {
  data: { project: string; id: string; actor?: string }
}): Promise<{ ok: true }> {
  if (isDesktopApp()) {
    await invoke('claim_bead', {
      projectId: data.project,
      id: data.id,
      actor: data.actor?.trim() || undefined,
    })
    return { ok: true }
  }
  return webClaimBead({ data })
}

export async function listGatesFn({
  data,
}: {
  data: { project: string }
}): Promise<Bead[]> {
  if (isDesktopApp()) {
    return invoke<Bead[]>('list_gates', { projectId: data.project })
  }
  return webListGates({ data })
}

export async function resolveGateFn({
  data,
}: {
  data: { project: string; id: string }
}): Promise<{ ok: true }> {
  if (isDesktopApp()) {
    await invoke('resolve_gate', { projectId: data.project, id: data.id })
    return { ok: true }
  }
  return webResolveGate({ data })
}

export async function reclaimBeadFn({
  data,
}: {
  data: { project: string; id: string }
}): Promise<{ ok: true }> {
  if (isDesktopApp()) {
    await invoke('reclaim_bead', { projectId: data.project, id: data.id })
    return { ok: true }
  }
  return webReclaimBead({ data })
}

export async function unclaimBeadFn({
  data,
}: {
  data: { project: string; id: string; force?: boolean; actor?: string }
}): Promise<{ ok: true }> {
  if (isDesktopApp()) {
    await invoke('unclaim_bead', {
      projectId: data.project,
      id: data.id,
      force: data.force ?? false,
      actor: data.actor?.trim() || undefined,
    })
    return { ok: true }
  }
  return webUnclaimBead({ data })
}

export async function getConfigFn({
  data,
}: {
  data: { project: string; key: string }
}): Promise<string> {
  if (isDesktopApp()) {
    return invoke<string>('get_config', {
      projectId: data.project,
      key: data.key,
    })
  }
  return webGetConfig({ data })
}

export async function readyExplainFn({
  data,
}: {
  data: { project: string }
}): Promise<ReadyExplain> {
  if (isDesktopApp()) {
    return parseReadyExplain(
      await invoke<unknown>('ready_explain', { projectId: data.project }),
    )
  }
  return webReadyExplain({ data })
}

export async function addRelationFn({
  data,
}: {
  data: { project: string; id: string; kind: RelationKind; target: string }
}): Promise<{ ok: true }> {
  if (isDesktopApp()) {
    await invoke('add_relation', {
      projectId: data.project,
      id: data.id,
      kind: data.kind,
      target: data.target,
    })
    return { ok: true }
  }
  return webAddRelation({ data })
}

export async function removeRelationFn({
  data,
}: {
  data: {
    project: string
    id: string
    kind: RemovableRelationKind
    target: string
  }
}): Promise<{ ok: true }> {
  if (isDesktopApp()) {
    await invoke('remove_relation', {
      projectId: data.project,
      id: data.id,
      kind: data.kind,
      target: data.target,
    })
    return { ok: true }
  }
  return webRemoveRelation({ data })
}

export async function updateBeadFn({
  data,
}: {
  data: { project: string; id: string; update: BeadUpdate }
}): Promise<{ ok: true }> {
  if (isDesktopApp()) {
    await invoke('update_bead', {
      projectId: data.project,
      id: data.id,
      update: data.update,
    })
    return { ok: true }
  }
  return webUpdateBead({ data })
}

export async function deferBeadFn({
  data,
}: {
  data: { project: string; id: string; until?: string }
}): Promise<{ ok: true }> {
  if (isDesktopApp()) {
    await invoke('defer_bead', {
      projectId: data.project,
      id: data.id,
      until: data.until,
    })
    return { ok: true }
  }
  return webDeferBead({ data })
}

export async function undeferBeadFn({
  data,
}: {
  data: { project: string; id: string }
}): Promise<{ ok: true }> {
  if (isDesktopApp()) {
    await invoke('undefer_bead', { projectId: data.project, id: data.id })
    return { ok: true }
  }
  return webUndeferBead({ data })
}

export async function previewDeleteBeadFn({
  data,
}: {
  data: { project: string; id: string }
}): Promise<DeletePlan> {
  if (isDesktopApp()) {
    return invoke<DeletePlan>('preview_delete_bead', {
      projectId: data.project,
      id: data.id,
    })
  }
  return webPreviewDeleteBead({ data })
}

export async function deleteBeadFn({
  data,
}: {
  data: { project: string; id: string }
}): Promise<{ ok: true }> {
  if (isDesktopApp()) {
    await invoke('delete_bead', { projectId: data.project, id: data.id })
    return { ok: true }
  }
  return webDeleteBead({ data })
}

export async function createBeadFn({
  data,
}: {
  data: {
    project: string
    title: string
    description?: string
    type?: string
    parent?: string
    labels?: string[]
  }
}): Promise<{ id: string }> {
  if (isDesktopApp()) {
    const id = await invoke<string>('create_bead', {
      projectId: data.project,
      title: data.title,
      description: data.description,
      type: data.type,
      parent: data.parent,
      labels: data.labels,
    })
    return { id }
  }
  return webCreateBead({ data })
}

export async function addCommentFn({
  data,
}: {
  data: { project: string; id: string; text: string }
}): Promise<{ ok: true }> {
  if (isDesktopApp()) {
    await invoke('add_comment', {
      projectId: data.project,
      id: data.id,
      text: data.text,
    })
    return { ok: true }
  }
  return webAddComment({ data })
}

export async function enableEventsJournalFn({
  data,
}: {
  data: { project: string }
}): Promise<{ ok: true }> {
  if (isDesktopApp()) {
    await invoke('enable_events_journal', { projectId: data.project })
    return { ok: true }
  }
  return webEnableEventsJournal({ data })
}

export function subscribeBeadFeed(
  project: string,
  since: number,
  onMessage: (msg: BeadFeedMessage) => void,
): () => void {
  let closed = false

  if (isDesktopApp()) {
    const channel = new Channel<BeadFeedMessage>()
    channel.onmessage = (msg) => {
      if (!closed) onMessage(msg)
    }
    let watchId: number | null = null
    invoke<number>('watch_bead_feed', {
      projectId: project,
      since,
      onMessage: channel,
    })
      .then((id) => {
        if (closed) {
          invoke('unwatch_bead_feed', { watchId: id }).catch(() => {})
        } else {
          watchId = id
        }
      })
      .catch((err) => {
        if (!closed) {
          onMessage({
            type: 'unsupported',
            message: toErrorMessage(err, 'Live updates unavailable'),
          })
        }
      })
    return () => {
      closed = true
      if (watchId !== null) {
        invoke('unwatch_bead_feed', { watchId }).catch(() => {})
      }
    }
  }

  const es = new EventSource(
    `/api/feed/${encodeURIComponent(project)}?since=${since}`,
  )
  es.onmessage = (e) => {
    if (closed) return
    const msg = JSON.parse(e.data) as BeadFeedMessage
    if (
      msg.type === 'disabled' ||
      msg.type === 'unsupported' ||
      msg.type === 'error'
    ) {
      es.close()
    }
    onMessage(msg)
  }
  es.onerror = () => {
    if (closed) return
    es.close()
    onMessage({ type: 'error', message: 'Live updates connection lost' })
  }
  return () => {
    closed = true
    es.close()
  }
}
export async function pickProjectDirectory(): Promise<string | null> {
  if (!isDesktopApp()) {
    throw new Error('Picking projects requires the desktop app')
  }
  const { open } = await import('@tauri-apps/plugin-dialog')
  const path = await open({ directory: true, multiple: false })
  return path || null
}

export async function addProject(path: string): Promise<AddProjectOutcome> {
  if (!isDesktopApp()) {
    throw new Error('Adding projects requires the desktop app')
  }
  return invoke<AddProjectOutcome>('add_project', { path })
}

export type PathStatus =
  | { kind: 'valid'; prefix?: string; external: boolean }
  | { kind: 'needsInit'; suggestedPrefix: string }
  | { kind: 'invalid'; reason: string }

export async function checkProjectPath(path: string): Promise<PathStatus> {
  if (!isDesktopApp()) {
    throw new Error('Checking project path requires the desktop app')
  }
  return invoke<PathStatus>('check_project_path', { path })
}

export async function initProject(
  path: string,
  prefix?: string,
): Promise<Project> {
  if (!isDesktopApp()) {
    throw new Error('Initializing projects requires the desktop app')
  }
  return invoke<Project>('init_project', { path, prefix })
}

export async function removeProject(id: string): Promise<void> {
  if (!isDesktopApp()) {
    throw new Error('Removing projects requires the desktop app')
  }
  return invoke<void>('remove_project', { id })
}

export async function renameProject(id: string, name: string): Promise<void> {
  if (!isDesktopApp()) {
    throw new Error('Renaming projects requires the desktop app')
  }
  return invoke<void>('rename_project', { id, name })
}

export async function relocateProject(id: string, path: string): Promise<void> {
  if (!isDesktopApp()) {
    throw new Error('Relocating projects requires the desktop app')
  }
  return invoke<void>('relocate_project', { id, path })
}
