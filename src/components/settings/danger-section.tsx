import { useState } from 'react'
import { useNavigate } from '@tanstack/react-router'

import { Button } from '@/components/ui/button'
import { ConfirmDeleteModal } from '@/components/confirm-delete-modal'

interface DangerSectionProps {
  projectId: string
  projectName: string
}

/** Removing a project from the desktop registry. The web app cannot do this. */
export function DangerSection({ projectId, projectName }: DangerSectionProps) {
  const navigate = useNavigate()
  const [open, setOpen] = useState(false)

  return (
    <div className="flex flex-col gap-4">
      <div className="flex flex-col gap-1">
        <h2 className="text-title font-semibold text-destructive">
          Danger zone
        </h2>
        <p className="text-body text-muted-foreground">
          Removing a project forgets it in bd-board. Its beads stay on disk.
        </p>
      </div>
      <div className="flex items-center justify-between gap-4 rounded-lg border border-destructive/50 p-4">
        <div className="flex flex-col gap-0.5">
          <span className="text-body text-foreground">
            Remove {projectName}
          </span>
          <span className="text-xs text-muted-foreground">
            Only the board registry changes.
          </span>
        </div>
        <Button
          type="button"
          variant="destructive"
          onClick={() => setOpen(true)}
        >
          Remove project
        </Button>
      </div>
      <ConfirmDeleteModal
        open={open}
        onOpenChange={setOpen}
        projectId={projectId}
        projectName={projectName}
        onRemoved={() => navigate({ to: '/' })}
      />
    </div>
  )
}
