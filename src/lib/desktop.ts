import { invoke, isTauri } from '@tauri-apps/api/core'

export interface DesktopProbe {
  bdBinary: string
  bdVersion: string
  projectRoots: string[]
  rootStatuses: { path: string; exists: boolean }[]
}

export async function loadDesktopProbe(): Promise<DesktopProbe | null> {
  if (typeof window === 'undefined') return null
  if (!isTauri()) return null
  return invoke<DesktopProbe>('desktop_probe')
}
