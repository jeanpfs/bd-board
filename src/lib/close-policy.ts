/**
 * bd ≥ 1.3 refuses to close a bead with open children or an active blocker;
 * `--force` overrides it. Returns bd's reason without the CLI advice and the
 * repeated batch summary, or null when the failure is something else.
 *
 *   "… cannot close ldg-axk: 3 open child issue(s); close children first or
 *    use --force to override Error: 1 of 1 issues failed …"
 *   → "Cannot close ldg-axk: 3 open child issue(s)"
 */
export function closeRefusalReason(message: string): string | null {
  const match = /cannot close ([^;\n]+?)(?:;|\s+Error:|\n|$)/i.exec(message)
  return match ? `Cannot close ${match[1].trim()}` : null
}
