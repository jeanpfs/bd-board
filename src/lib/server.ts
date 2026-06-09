import { createServerFn } from '@tanstack/react-start'
import {
  discoverProjects,
  listBeads,
  getBeadDetail,
  updateBeadStatus,
  createBead,
  addComment,
} from './bd.ts'

export const getProjects = createServerFn({ method: 'GET' }).handler(() =>
  discoverProjects(),
)

export const getBeads = createServerFn({ method: 'GET' })
  .validator((input: { project: string }) => input)
  .handler(({ data }) => listBeads(data.project))

export const getBeadDetailFn = createServerFn({ method: 'GET' })
  .validator((input: { project: string; id: string }) => input)
  .handler(({ data }) => getBeadDetail(data.project, data.id))

export const updateBeadStatusFn = createServerFn({ method: 'POST' })
  .validator((input: { project: string; id: string; status: string }) => input)
  .handler(async ({ data }) => {
    await updateBeadStatus(data.project, data.id, data.status)
    return { ok: true as const }
  })

export const createBeadFn = createServerFn({ method: 'POST' })
  .validator(
    (input: {
      project: string
      title: string
      description?: string
      type?: string
      parent?: string
    }) => input,
  )
  .handler(async ({ data }) => {
    const id = await createBead(data.project, {
      title: data.title,
      description: data.description,
      type: data.type,
      parent: data.parent,
    })
    return { id }
  })

export const addCommentFn = createServerFn({ method: 'POST' })
  .validator((input: { project: string; id: string; text: string }) => input)
  .handler(async ({ data }) => {
    await addComment(data.project, data.id, data.text)
    return { ok: true as const }
  })
