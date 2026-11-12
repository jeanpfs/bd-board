import { useCallback } from 'react'
import { useQueryClient } from '@tanstack/react-query'
import { confirm } from '@tauri-apps/plugin-dialog'
import { toast } from 'sonner'

import { addProject, initProject, pickProjectDirectory } from '@/lib/server'
import { toErrorMessage } from '@/lib/utils'

/** Open an existing beads folder, or initialize beads in a new one. */
export function useProjectActions() {
  const queryClient = useQueryClient()

  const handleOpenProject = useCallback(async () => {
    try {
      const path = await pickProjectDirectory()
      if (!path) return

      const outcome = await addProject(path)
      if (outcome.kind === 'registered') {
        queryClient.invalidateQueries({ queryKey: ['projects'] })
        toast.success('Project opened')
      } else {
        const confirmed = await confirm(
          `Initialize a new beads workspace at:\n${outcome.path}\n\nPrefix: ${outcome.suggestedPrefix}`,
          {
            title: 'No beads workspace',
            okLabel: 'Initialize',
            cancelLabel: 'Cancel',
          },
        )
        if (confirmed) {
          await initProject(outcome.path, outcome.suggestedPrefix)
          queryClient.invalidateQueries({ queryKey: ['projects'] })
          toast.success('Project initialized')
        }
      }
    } catch (err) {
      toast.error(toErrorMessage(err, 'Failed to open project'))
    }
  }, [queryClient])

  const handleInitProject = useCallback(async () => {
    try {
      const path = await pickProjectDirectory()
      if (!path) return

      await initProject(path)
      queryClient.invalidateQueries({ queryKey: ['projects'] })
      toast.success('Project initialized')
    } catch (err) {
      toast.error(toErrorMessage(err, 'Failed to initialize project'))
    }
  }, [queryClient])

  return { handleOpenProject, handleInitProject }
}
