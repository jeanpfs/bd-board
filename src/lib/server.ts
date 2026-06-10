import { createServerFn } from '@tanstack/react-start'
import {
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
} from './bd.ts'
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

export const getProjects = createServerFn({ method: 'GET' }).handler(() =>
  discoverProjects(),
)

export const getBeads = createServerFn({ method: 'GET' })
  .validator(parseProjectInput)
  .handler(({ data }) => listBeads(data.project))

export const getBeadDetailFn = createServerFn({ method: 'GET' })
  .validator(parseBeadInput)
  .handler(({ data }) => getBeadDetail(data.project, data.id))

export const getProjectKnowledgeFn = createServerFn({ method: 'GET' })
  .validator(parseProjectInput)
  .handler(({ data }) => getProjectKnowledge(data.project))

export const getWriteConfigFn = createServerFn({ method: 'GET' }).handler(
  () => ({ writesEnabled: isWritesEnabled() }),
)

export const updateBeadStatusFn = createServerFn({ method: 'POST' })
  .validator(parseStatusUpdateInput)
  .handler(async ({ data }) => {
    assertWritesEnabled()
    await updateBeadStatus(data.project, data.id, data.status)
    return { ok: true as const }
  })

export const updateBeadFn = createServerFn({ method: 'POST' })
  .validator(parseUpdateBeadInput)
  .handler(async ({ data }) => {
    assertWritesEnabled()
    await updateBead(data.project, data.id, data.update)
    return { ok: true as const }
  })

export const previewDeleteBeadFn = createServerFn({ method: 'POST' })
  .validator(parseBeadInput)
  .handler(async ({ data }) => {
    assertWritesEnabled()
    const preview = await previewDeleteBead(data.project, data.id)
    return { preview }
  })

export const deleteBeadFn = createServerFn({ method: 'POST' })
  .validator(parseBeadInput)
  .handler(async ({ data }) => {
    assertWritesEnabled()
    await deleteBead(data.project, data.id)
    return { ok: true as const }
  })

export const createBeadFn = createServerFn({ method: 'POST' })
  .validator(parseCreateBeadInput)
  .handler(async ({ data }) => {
    assertWritesEnabled()
    const id = await createBead(data.project, {
      title: data.title,
      description: data.description,
      type: data.type,
      parent: data.parent,
    })
    return { id }
  })

export const addCommentFn = createServerFn({ method: 'POST' })
  .validator(parseCommentInput)
  .handler(async ({ data }) => {
    assertWritesEnabled()
    await addComment(data.project, data.id, data.text)
    return { ok: true as const }
  })
