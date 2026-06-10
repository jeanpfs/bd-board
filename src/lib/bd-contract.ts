import type {
  Bead,
  BeadDetail,
  BeadUpdate,
  Project,
  ProjectKnowledge,
} from './types.ts'

export interface BdAdapter {
  discoverProjects: () => Promise<Project[]>
  listBeads: (database: string) => Promise<Bead[]>
  getBeadDetail: (database: string, id: string) => Promise<BeadDetail>
  getProjectKnowledge: (database: string) => Promise<ProjectKnowledge>
  updateBeadStatus: (
    database: string,
    id: string,
    status: string,
  ) => Promise<void>
  updateBead: (database: string, id: string, opts: BeadUpdate) => Promise<void>
  previewDeleteBead: (database: string, id: string) => Promise<string>
  deleteBead: (database: string, id: string) => Promise<void>
  createBead: (
    database: string,
    opts: {
      title: string
      description?: string
      type?: string
      parent?: string
    },
  ) => Promise<string>
  addComment: (database: string, id: string, text: string) => Promise<void>
}
