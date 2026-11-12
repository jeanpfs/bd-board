import { closestCorners, pointerWithin } from '@dnd-kit/core'

import type { CollisionDetection } from '@dnd-kit/core'

/**
 * The drop target is whatever is under the pointer; only when the pointer is
 * outside every column does the dragged card's nearest corner decide. With
 * corners alone a card grabbed by its right-hand handle had to travel most of
 * a column width before the next column won.
 */
export const pointerFirst: CollisionDetection = (args) => {
  const underPointer = pointerWithin(args)
  return underPointer.length > 0 ? underPointer : closestCorners(args)
}
