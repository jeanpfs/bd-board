import { cn } from '@/lib/utils'

/** Full class names so Tailwind generates them; order follows the registry. */
const PROJECT_BG = [
  'bg-project-1',
  'bg-project-2',
  'bg-project-3',
  'bg-project-4',
  'bg-project-5',
  'bg-project-6',
] as const

/**
 * Colored initial that identifies a project across the rail, cards and lists.
 * `index` is the project's position in the registry, so a project keeps its
 * color everywhere; colors repeat after six projects.
 */
function ProjectChip({
  name,
  index,
  size = 16,
  className,
}: {
  name: string
  index: number
  size?: 16 | 22
  className?: string
}) {
  return (
    <span
      aria-hidden="true"
      className={cn(
        'grid shrink-0 place-items-center font-semibold text-white',
        PROJECT_BG[
          ((index % PROJECT_BG.length) + PROJECT_BG.length) % PROJECT_BG.length
        ],
        size === 22
          ? 'size-[22px] rounded-md text-xs'
          : 'size-4 rounded-sm text-badge',
        className,
      )}
    >
      {name.trim().charAt(0).toUpperCase() || '?'}
    </span>
  )
}

export { ProjectChip }
