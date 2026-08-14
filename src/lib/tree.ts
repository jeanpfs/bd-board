import type { Bead } from './types'

/** Groups beads by their `parent` id. Beads without a parent are omitted. */
export function buildChildrenMap(beads: Bead[]): Map<string, Bead[]> {
  const map = new Map<string, Bead[]>()
  for (const bead of beads) {
    if (!bead.parent) continue
    const list = map.get(bead.parent)
    if (list) list.push(bead)
    else map.set(bead.parent, [bead])
  }
  return map
}

/** Beads with no parent — the roots of the project's bead forest. */
export function getRootBeads(beads: Bead[]): Bead[] {
  return beads.filter((bead) => !bead.parent)
}
