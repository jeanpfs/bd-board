import { useMutation, useQueryClient } from '@tanstack/react-query'
import { toast } from 'sonner'
import { Loader2 } from 'lucide-react'

import { Button } from '@/components/ui/button'
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog'
import { removeProject } from '@/lib/server'
import { toErrorMessage } from '@/lib/utils'

interface ConfirmDeleteModalProps {
  open: boolean
  onOpenChange: (open: boolean) => void
  projectId: string
  projectName: string
}

export function ConfirmDeleteModal({
  open,
  onOpenChange,
  projectId,
  projectName,
}: ConfirmDeleteModalProps) {
  const queryClient = useQueryClient()

  const deleteMutation = useMutation({
    mutationFn: () => removeProject(projectId),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['projects'] })
      toast.success(`Project "${projectName}" removed`)
      onOpenChange(false)
    },
    onError: (err) => {
      toast.error(toErrorMessage(err, 'Failed to delete project'))
    },
  })

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-[400px]">
        <DialogHeader>
          <DialogTitle>Remove Project</DialogTitle>
          <DialogDescription>
            This action cannot be undone. The project will be removed from
            bd-board's registry.
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-4">
          <p className="text-sm">
            Remove project{' '}
            <span className="font-semibold">"{projectName}"</span> from
            bd-board?
          </p>
          <p className="text-xs text-muted-foreground">
            The project files and beads workspace will remain on disk.
          </p>
        </div>

        <div className="flex justify-end gap-2">
          <Button
            variant="outline"
            onClick={() => onOpenChange(false)}
            disabled={deleteMutation.isPending}
          >
            Cancel
          </Button>
          <Button
            variant="destructive"
            onClick={() => deleteMutation.mutate()}
            disabled={deleteMutation.isPending}
          >
            {deleteMutation.isPending && (
              <Loader2 className="mr-2 h-4 w-4 animate-spin" />
            )}
            Remove
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  )
}
