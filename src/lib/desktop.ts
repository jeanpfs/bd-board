import { invoke, isTauri } from '@tauri-apps/api/core'

export interface DesktopProbe {
  bdBinary: string
  bdVersion: string
  registryPath: string
  projectCount: number
}

interface RawDesktopProbe {
  bdBinary?: string
  bd_binary?: string
  bdVersion?: string
  bd_version?: string
  registryPath?: string
  registry_path?: string
  projectCount?: number
  project_count?: number
}

export function normalizeDesktopProbe(probe: RawDesktopProbe): DesktopProbe {
  return {
    bdBinary: probe.bdBinary ?? probe.bd_binary ?? 'bd',
    bdVersion: probe.bdVersion ?? probe.bd_version ?? '',
    registryPath: probe.registryPath ?? probe.registry_path ?? '',
    projectCount: probe.projectCount ?? probe.project_count ?? 0,
  }
}

export async function loadDesktopProbe(): Promise<DesktopProbe | null> {
  if (typeof window === 'undefined') return null
  if (!isTauri()) return null
  return normalizeDesktopProbe(await invoke<RawDesktopProbe>('desktop_probe'))
}
