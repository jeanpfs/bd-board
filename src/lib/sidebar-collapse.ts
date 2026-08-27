const KEY = 'bdb.sidebar-collapsed.v1'

/**
 * Sidebar collapse is a per-device UI preference, so it lives in
 * localStorage rather than the URL. localStorage throws under file:// and in
 * sandboxed frames, so failures are swallowed and the rail stays expanded.
 */
export function getStoredSidebarCollapsed(): boolean {
  try {
    return localStorage.getItem(KEY) === '1'
  } catch {
    return false
  }
}

export function setStoredSidebarCollapsed(value: boolean): void {
  try {
    if (value) localStorage.setItem(KEY, '1')
    else localStorage.removeItem(KEY)
  } catch {
    // Ignore: collapse state is a convenience, not a requirement.
  }
}
