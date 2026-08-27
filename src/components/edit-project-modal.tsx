import { useState } from 'react'
import { useMutation, useQueryClient } from '@tanstack/react-query'
import { toast } from 'sonner'
import { AlertCircle, Loader2 } from 'lucide-react'

import { Button } from '@/components/ui/button'
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import {
  pickProjectDirectory,
  renameProject,
  relocateProject,
  checkProjectPath,
  initProject,
} from '@/lib/server'
import { toErrorMessage } from '@/lib/utils'

import type { Project } from '@/lib/types'

interface EditProjectModalProps {
  open: boolean
  onOpenChange: (open: boolean) => void
  project: Project
}

export function EditProjectModal({
  open,
  onOpenChange,
  project,
}: EditProjectModalProps) {
  const [name, setName] = useState(project.name)
  const [newPath, setNewPath] = useState(project.dir)
  const [pathValidation, setPathValidation] = useState<
    'idle' | 'valid' | 'invalid' | 'checking' | 'needsInit'
  >('idle')
  const [confirmInitShown, setConfirmInitShown] = useState(false)
  const queryClient = useQueryClient()

  const renameMutation = useMutation({
    mutationFn: async () => {
      // Rename if name changed
      if (name !== project.name) {
        await renameProject(project.id, name)
      }
      // Relocate if path changed
      if (newPath !== project.dir) {
        await relocateProject(project.id, newPath)
      }
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['projects'] })
      toast.success('Project updated')
      onOpenChange(false)
      setName(project.name)
      setNewPath(project.dir)
    },
    onError: (err) => {
      toast.error(toErrorMessage(err, 'Failed to update project'))
    },
  })

  const initMutation = useMutation({
    mutationFn: async () => {
      await initProject(newPath)
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['projects'] })
      toast.success('Project initialized and updated')
      onOpenChange(false)
      setName(project.name)
      setNewPath(project.dir)
    },
    onError: (err) => {
      toast.error(toErrorMessage(err, 'Failed to initialize project'))
    },
  })

  async function validatePath(path: string) {
    setPathValidation('checking')
    try {
      const status = await checkProjectPath(path)
      switch (status.kind) {
        case 'valid':
          setPathValidation('valid')
          break
        case 'needsInit':
          setPathValidation('needsInit')
          break
        case 'invalid':
          setPathValidation('invalid')
          break
      }
    } catch (err) {
      toast.error(toErrorMessage(err, 'Failed to validate path'))
      setPathValidation('invalid')
    }
  }

  async function handleBrowse() {
    try {
      const path = await pickProjectDirectory()
      if (!path) return
      setNewPath(path)
      await validatePath(path)
    } catch (err) {
      toast.error(toErrorMessage(err, 'Failed to pick directory'))
      setPathValidation('invalid')
    }
  }

  function handleSave() {
    if (!name.trim()) {
      toast.error('Project name cannot be empty')
      return
    }
    if (pathValidation === 'invalid') {
      toast.error('Path is invalid. Please choose a valid project folder.')
      return
    }
    if (pathValidation === 'needsInit') {
      setConfirmInitShown(true)
      return
    }
    renameMutation.mutate()
  }

  function handleConfirmInit() {
    setConfirmInitShown(false)
    initMutation.mutate()
  }

  if (confirmInitShown) {
    return (
      <Dialog open={open} onOpenChange={onOpenChange}>
        <DialogContent className="sm:max-w-[500px]">
          <DialogHeader>
            <DialogTitle>Initialize Workspace</DialogTitle>
            <DialogDescription>
              The selected folder does not have a beads workspace yet.
            </DialogDescription>
          </DialogHeader>

          <div className="space-y-4">
            <p className="text-sm">
              Would you like to initialize a new beads workspace at:{' '}
              <span className="font-mono">{newPath}</span>?
            </p>
          </div>

          <div className="flex justify-end gap-2">
            <Button
              variant="outline"
              onClick={() => setConfirmInitShown(false)}
              disabled={initMutation.isPending}
            >
              Cancel
            </Button>
            <Button
              onClick={handleConfirmInit}
              disabled={initMutation.isPending}
            >
              {initMutation.isPending && (
                <Loader2 className="mr-2 h-4 w-4 animate-spin" />
              )}
              Initialize
            </Button>
          </div>
        </DialogContent>
      </Dialog>
    )
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-[500px]">
        <DialogHeader>
          <DialogTitle>Editar Projeto</DialogTitle>
          <DialogDescription>
            Customize project name and location. Prefix cannot be changed.
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-4">
          {/* Name Field */}
          <div>
            <Label htmlFor="project-name">Project Name</Label>
            <Input
              id="project-name"
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder="e.g., ravo"
              disabled={renameMutation.isPending || initMutation.isPending}
            />
          </div>

          {/* Path Field */}
          <div>
            <Label htmlFor="project-path">Path</Label>
            <div className="flex gap-2">
              <Input
                id="project-path"
                value={newPath}
                readOnly
                className="bg-muted"
              />
              <Button
                variant="outline"
                onClick={handleBrowse}
                disabled={
                  renameMutation.isPending ||
                  initMutation.isPending ||
                  pathValidation === 'checking'
                }
              >
                Browse...
              </Button>
            </div>
            {pathValidation === 'checking' && (
              <p className="mt-1 text-sm text-muted-foreground">
                Validating...
              </p>
            )}
            {pathValidation === 'valid' && (
              <p className="mt-1 text-sm text-green-600">
                ✓ Beads workspace found
              </p>
            )}
            {pathValidation === 'needsInit' && (
              <p className="mt-1 text-sm text-amber-600">
                ⚠ No beads workspace — will initialize if saved
              </p>
            )}
            {pathValidation === 'invalid' && (
              <p className="mt-1 text-sm text-destructive">
                ✗ Path does not exist or is not accessible
              </p>
            )}
          </div>

          {/* Read-only Info */}
          <div className="space-y-2 rounded-lg bg-muted p-3 text-sm">
            <div className="flex justify-between">
              <span className="text-muted-foreground">Prefix:</span>
              <span className="font-mono">{project.prefix || '(none)'}</span>
            </div>
            <div className="flex justify-between">
              <span className="text-muted-foreground">Beads:</span>
              <span className="font-mono text-xs">{project.beadsPath}</span>
            </div>
            {project.external && (
              <div className="flex gap-2 text-amber-600">
                <AlertCircle className="h-4 w-4 flex-shrink-0" />
                <span>External workspace (outside project folder)</span>
              </div>
            )}
          </div>
        </div>

        <div className="flex justify-end gap-2">
          <Button
            variant="outline"
            onClick={() => onOpenChange(false)}
            disabled={renameMutation.isPending || initMutation.isPending}
          >
            Cancel
          </Button>
          <Button
            onClick={handleSave}
            disabled={
              renameMutation.isPending ||
              initMutation.isPending ||
              pathValidation === 'invalid' ||
              pathValidation === 'checking'
            }
          >
            {(renameMutation.isPending || initMutation.isPending) && (
              <Loader2 className="mr-2 h-4 w-4 animate-spin" />
            )}
            Save
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  )
}
