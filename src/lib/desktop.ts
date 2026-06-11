import { invoke, isTauri } from '@tauri-apps/api/core'

export interface DesktopProbe {
  bdBinary: string
  bdVersion: string
  projectRoots: string[]
  rootStatuses: { path: string; exists: boolean }[]
}

interface RawDesktopProbe {
  bdBinary?: string
  bd_binary?: string
  bdVersion?: string
  bd_version?: string
  projectRoots?: string[]
  project_roots?: string[]
  rootStatuses?: { path: string; exists: boolean }[]
  root_statuses?: { path: string; exists: boolean }[]
}

export function normalizeDesktopProbe(probe: RawDesktopProbe): DesktopProbe {
  return {
    bdBinary: probe.bdBinary ?? probe.bd_binary ?? 'bd',
    bdVersion: probe.bdVersion ?? probe.bd_version ?? '',
    projectRoots: probe.projectRoots ?? probe.project_roots ?? [],
    rootStatuses: probe.rootStatuses ?? probe.root_statuses ?? [],
  }
}

export async function loadDesktopProbe(): Promise<DesktopProbe | null> {
  if (typeof window === 'undefined') return null
  if (!isTauri()) return null
  return normalizeDesktopProbe(await invoke<RawDesktopProbe>('desktop_probe'))
}
