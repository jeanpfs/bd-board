const MAC_RE = /Mac|iPhone|iPad/

/** True on Apple platforms; false during SSR, where `navigator` is absent. */
export function isMacPlatform(): boolean {
  return typeof navigator !== 'undefined' && MAC_RE.test(navigator.platform)
}
