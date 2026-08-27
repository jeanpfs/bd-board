import { useEffect, useState, useCallback } from 'react'
import type { Project } from '@/lib/types'
import { checkProjectPath } from '@/lib/server'
import type { PathStatus } from '@/lib/server'

interface BrokenProject {
  project: Project
  status: PathStatus
}

interface UseValidateProjectsOnMountReturn {
  brokenProjects: BrokenProject[]
  currentBrokenIndex: number
  currentBrokenProject: BrokenProject | null
  isLoading: boolean
  moveToNextBroken: () => void
  closeBrokenModal: () => void
}

/**
 * Hook that validates all registered projects on mount.
 * If any are broken (invalid or needsInit), opens EditProjectModal sequentially (one per time).
 * Uses array order from projects.json (no lastUsed tracking).
 */
export function useValidateProjectsOnMount(
  projects: Project[] | undefined,
): UseValidateProjectsOnMountReturn {
  const [brokenProjects, setBrokenProjects] = useState<BrokenProject[]>([])
  const [currentBrokenIndex, setCurrentBrokenIndex] = useState(0)
  const [isLoading, setIsLoading] = useState(false)

  // Validate all projects on mount or when projects change
  useEffect(() => {
    if (!projects || projects.length === 0) {
      setBrokenProjects([])
      setCurrentBrokenIndex(0)
      return
    }

    const validateProjects = async () => {
      setIsLoading(true)
      const broken: BrokenProject[] = []

      for (const project of projects) {
        try {
          const status = await checkProjectPath(project.dir)
          if (status.kind !== 'valid') {
            broken.push({ project, status })
          }
        } catch (err) {
          // Treat check errors as "invalid" for safety
          console.warn(
            `Failed to validate project ${project.id}:`,
            err instanceof Error ? err.message : String(err),
          )
          broken.push({
            project,
            status: { kind: 'invalid', reason: 'validation_failed' },
          })
        }
      }

      setBrokenProjects(broken)
      setCurrentBrokenIndex(broken.length > 0 ? 0 : -1)
      setIsLoading(false)
    }

    validateProjects()
  }, [projects])

  const moveToNextBroken = useCallback(() => {
    if (currentBrokenIndex < brokenProjects.length - 1) {
      setCurrentBrokenIndex((prev) => prev + 1)
    } else {
      // All broken projects processed
      setCurrentBrokenIndex(-1)
      setBrokenProjects([])
    }
  }, [currentBrokenIndex, brokenProjects.length])

  const closeBrokenModal = useCallback(() => {
    // Close current and move to next if available
    if (brokenProjects.length > 0) {
      moveToNextBroken()
    }
  }, [brokenProjects.length, moveToNextBroken])

  return {
    brokenProjects,
    currentBrokenIndex,
    currentBrokenProject:
      currentBrokenIndex >= 0 && currentBrokenIndex < brokenProjects.length
        ? brokenProjects[currentBrokenIndex]
        : null,
    isLoading,
    moveToNextBroken,
    closeBrokenModal,
  }
}
