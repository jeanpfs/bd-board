const KEY = 'bdb.identity.v1'

/**
 * The app has no user-identity concept of its own — bead assignees are
 * free-text values from bd (an email, "claude-agent", etc). "Assigned to
 * me" only works once the user picks which observed assignee is "me",
 * persisted locally. localStorage throws under file:// and in sandboxed
 * frames, so failures are swallowed and the app falls back to no identity.
 */
export function getStoredIdentity(): string | null {
  try {
    return localStorage.getItem(KEY)
  } catch {
    return null
  }
}

export function setStoredIdentity(value: string | null): void {
  try {
    if (value) localStorage.setItem(KEY, value)
    else localStorage.removeItem(KEY)
  } catch {
    // Ignore: identity is a convenience, not a requirement.
  }
}
