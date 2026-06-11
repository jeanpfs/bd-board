import { invoke, isTauri } from '@tauri-apps/api/core'
import { createServerFn } from '@tanstack/react-start'

import { bdAdapter } from './bd.ts'
import {
  assertWritesEnabled,
  parseBeadInput,
  parseCommentInput,
  parseCreateBeadInput,
  parseProjectInput,
  parseStatusUpdateInput,
  parseUpdateBeadInput,
  isWritesEnabled,
} from './server-validation.ts'

import type { Bead, BeadDetail, Project, ProjectKnowledge } from './types.ts'
import type { BeadUpdate } from './types.ts'

function isDesktopApp(): boolean {
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

const webGetWriteConfig = createServerFn({ method: 'GET' }).handler(() => ({
  writesEnabled: isWritesEnabled(),
}))

const webUpdateBeadStatus = createServerFn({ method: 'POST' })
  .validator(parseStatusUpdateInput)
  .handler(async ({ data }) => {
    assertWritesEnabled()
    await bdAdapter.updateBeadStatus(data.project, data.id, data.status)
    return { ok: true as const }
  })

const webUpdateBead = createServerFn({ method: 'POST' })
  .validator(parseUpdateBeadInput)
  .handler(async ({ data }) => {
    assertWritesEnabled()
    await bdAdapter.updateBead(data.project, data.id, data.update)
    return { ok: true as const }
  })

const webPreviewDeleteBead = createServerFn({ method: 'POST' })
  .validator(parseBeadInput)
  .handler(async ({ data }) => {
    assertWritesEnabled()
    const preview = await bdAdapter.previewDeleteBead(data.project, data.id)
    return { preview }
  })

const webDeleteBead = createServerFn({ method: 'POST' })
  .validator(parseBeadInput)
  .handler(async ({ data }) => {
    assertWritesEnabled()
    await bdAdapter.deleteBead(data.project, data.id)
    return { ok: true as const }
  })

const webCreateBead = createServerFn({ method: 'POST' })
  .validator(parseCreateBeadInput)
  .handler(async ({ data }) => {
    assertWritesEnabled()
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
    assertWritesEnabled()
    await bdAdapter.addComment(data.project, data.id, data.text)
    return { ok: true as const }
  })

function desktopWritesDisabled(): never {
  throw new Error('Writes are disabled in desktop mode')
}

export async function getProjects(): Promise<Project[]> {
  if (isDesktopApp()) return invoke<Project[]>('discover_projects')
  return webGetProjects()
}

export async function getBeads({
  data,
}: {
  data: { project: string }
}): Promise<Bead[]> {
  if (isDesktopApp())
    return invoke<Bead[]>('list_beads', { database: data.project })
  return webGetBeads({ data })
}

export async function getBeadDetailFn({
  data,
}: {
  data: { project: string; id: string }
}): Promise<BeadDetail> {
  if (isDesktopApp())
    return invoke<BeadDetail>('get_bead_detail', {
      database: data.project,
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
      database: data.project,
    })
  return webGetProjectKnowledge({ data })
}

export async function getWriteConfigFn(): Promise<{ writesEnabled: boolean }> {
  if (isDesktopApp()) return invoke<{ writesEnabled: boolean }>('get_write_config')
  return webGetWriteConfig()
}

export async function updateBeadStatusFn({
  data,
}: {
  data: { project: string; id: string; status: string }
}): Promise<{ ok: true }> {
  if (isDesktopApp()) desktopWritesDisabled()
  return webUpdateBeadStatus({ data })
}

export async function updateBeadFn({
  data,
}: {
  data: { project: string; id: string; update: BeadUpdate }
}): Promise<{ ok: true }> {
  if (isDesktopApp()) desktopWritesDisabled()
  return webUpdateBead({ data })
}

export async function previewDeleteBeadFn({
  data,
}: {
  data: { project: string; id: string }
}): Promise<{ preview: string }> {
  if (isDesktopApp()) desktopWritesDisabled()
  return webPreviewDeleteBead({ data })
}

export async function deleteBeadFn({
  data,
}: {
  data: { project: string; id: string }
}): Promise<{ ok: true }> {
  if (isDesktopApp()) desktopWritesDisabled()
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
  if (isDesktopApp()) desktopWritesDisabled()
  return webCreateBead({ data })
}

export async function addCommentFn({
  data,
}: {
  data: { project: string; id: string; text: string }
}): Promise<{ ok: true }> {
  if (isDesktopApp()) desktopWritesDisabled()
  return webAddComment({ data })
}
