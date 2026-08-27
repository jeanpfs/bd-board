import type {
  Bead,
  BeadDetail,
  BeadUpdate,
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
  updateBead: (projectId: string, id: string, opts: BeadUpdate) => Promise<void>
  previewDeleteBead: (projectId: string, id: string) => Promise<string>
  deleteBead: (projectId: string, id: string) => Promise<void>
  createBead: (
    projectId: string,
    opts: {
      title: string
      description?: string
      type?: string
      parent?: string
    },
  ) => Promise<string>
  addComment: (projectId: string, id: string, text: string) => Promise<void>
}
