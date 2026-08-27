import { readTextFile, exists } from '@tauri-apps/plugin-fs'
import * as os from 'node:os'
import * as path from 'node:path'

export interface RegistryEntry {
  id: string
  path: string
  label: string
}

export interface Registry {
  version: number
  projects: RegistryEntry[]
}

export function registryPath(): string {
  const home = os.homedir()
  return path.join(home, '.config', 'bd-board', 'projects.json')
}

export async function loadRegistry(): Promise<RegistryEntry[]> {
  const regPath = registryPath()

  try {
    const fileExists = await exists(regPath)
    if (!fileExists) {
      return []
    }

    const content = await readTextFile(regPath)
    const registry = JSON.parse(content) as Registry

    if (registry.version !== 1) {
      throw new Error(
        `unsupported registry version ${registry.version}; expected 1`,
      )
    }

    return registry.projects
  } catch (error) {
    if (
      error instanceof Error &&
      error.message.includes('unsupported registry version')
    ) {
      throw error
    }
    // Treat parse errors or file read errors as empty registry
    return []
  }
}
