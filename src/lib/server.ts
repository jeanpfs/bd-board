import { invoke, isTauri } from '@tauri-apps/api/core'
import { createServerFn } from '@tanstack/react-start'

import { bdAdapter } from './bd.ts'
import {
  parseBeadInput,
  parseCommentInput,
  parseCreateBeadInput,
  parseProjectInput,
  parseStatusUpdateInput,
  parseUpdateBeadInput,
} from './server-validation.ts'

import type {
  AddProjectOutcome,
  Bead,
  BeadDetail,
  BeadUpdate,
  Project,
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

const webUpdateBead = createServerFn({ method: 'POST' })
  .validator(parseUpdateBeadInput)
  .handler(async ({ data }) => {
    await bdAdapter.updateBead(data.project, data.id, data.update)
    return { ok: true as const }
  })

const webPreviewDeleteBead = createServerFn({ method: 'POST' })
  .validator(parseBeadInput)
  .handler(async ({ data }) => {
    const preview = await bdAdapter.previewDeleteBead(data.project, data.id)
    return { preview }
  })

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
    })
    return { id }
  })

const webAddComment = createServerFn({ method: 'POST' })
  .validator(parseCommentInput)
  .handler(async ({ data }) => {
    await bdAdapter.addComment(data.project, data.id, data.text)
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

export async function previewDeleteBeadFn({
  data,
}: {
  data: { project: string; id: string }
}): Promise<{ preview: string }> {
  if (isDesktopApp()) {
    const preview = await invoke<string>('preview_delete_bead', {
      projectId: data.project,
      id: data.id,
    })
    return { preview }
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
  }
}): Promise<{ id: string }> {
  if (isDesktopApp()) {
    const id = await invoke<string>('create_bead', {
      projectId: data.project,
      title: data.title,
      description: data.description,
      type: data.type,
      parent: data.parent,
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
