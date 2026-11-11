import { useEffect, useState } from 'react'
import { useMutation, useQueryClient } from '@tanstack/react-query'
import { AlertTriangle, CheckCircle2, Loader2 } from 'lucide-react'
import { toast } from 'sonner'

import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog'
import { Button } from '@/components/ui/button'
import { Label } from '@/components/ui/label'
import { Textarea } from '@/components/ui/textarea'
import { closeBeadFn } from '@/lib/server'
import { closeRefusalReason } from '@/lib/close-policy'
import { toErrorMessage } from '@/lib/utils'

export function CloseBeadDialog({
  project,
  bead,
  open,
  onOpenChange,
  refusal: initialRefusal,
}: {
  project: string
  bead: { id: string; title: string } | null
  open: boolean
  onOpenChange: (open: boolean) => void
  /** bd's refusal reason from an earlier attempt (e.g. a drag to Closed). */
  refusal?: string
}) {
  const queryClient = useQueryClient()
  const [reason, setReason] = useState('')
  const [refusal, setRefusal] = useState<string | undefined>(initialRefusal)

  useEffect(() => {
    if (!open) return
    setReason('')
    setRefusal(initialRefusal)
  }, [open, bead?.id, initialRefusal])

  const mutation = useMutation({
    mutationFn: (force: boolean) =>
      closeBeadFn({
        data: {
          project,
          id: bead!.id,
          reason: reason.trim() || undefined,
          force,
        },
      }),
    onSuccess: () => {
      toast.success(`Bead ${bead!.id} closed`)
      queryClient.invalidateQueries({ queryKey: ['beads', project] })
      queryClient.invalidateQueries({ queryKey: ['bead', project, bead!.id] })
      queryClient.invalidateQueries({ queryKey: ['projects'] })
      onOpenChange(false)
    },
    onError: (error) => {
      const message = toErrorMessage(error, 'Failed to close bead')
      const refused = closeRefusalReason(message)
      if (refused) setRefusal(refused)
      else toast.error(message)
    },
  })

  if (!bead) return null
  const forced = refusal !== undefined

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>Close bead</DialogTitle>
          <DialogDescription>
            <span className="font-mono text-foreground">{bead.id}</span>:{' '}
            <span className="text-foreground">{bead.title}</span>
          </DialogDescription>
        </DialogHeader>

        <form
          className="flex flex-col gap-4"
          onSubmit={(event) => {
            event.preventDefault()
            if (!mutation.isPending) mutation.mutate(forced)
          }}
        >
          {forced ? (
            <div className="flex items-start gap-2 rounded-lg bg-warn/10 px-3 py-2 text-sm ring-1 ring-inset ring-warn/30">
              <AlertTriangle
                className="mt-0.5 size-4 shrink-0 text-warn"
                aria-hidden="true"
              />
              <div>
                <p className="font-medium text-foreground">
                  bd refused to close it
                </p>
                <p className="mt-0.5 text-muted-foreground">{refusal}</p>
                <p className="mt-1.5 text-muted-foreground">
                  Close anyway overrides this check; open children and blocked
                  work stay as they are.
                </p>
              </div>
            </div>
          ) : null}

          <div className="flex flex-col gap-1.5">
            <Label htmlFor="close-bead-reason">Reason (optional)</Label>
            <Textarea
              id="close-bead-reason"
              value={reason}
              onChange={(event) => setReason(event.target.value)}
              placeholder="Done, duplicate of …, won't fix because …"
              rows={3}
              maxLength={2000}
              autoFocus
            />
          </div>

          <DialogFooter>
            <Button
              type="button"
              variant="ghost"
              onClick={() => onOpenChange(false)}
              disabled={mutation.isPending}
            >
              Cancel
            </Button>
            <Button
              type="submit"
              variant={forced ? 'destructive' : 'default'}
              disabled={mutation.isPending}
            >
              {mutation.isPending ? (
                <Loader2 className="size-3.5 animate-spin" aria-hidden="true" />
              ) : (
                <CheckCircle2 className="size-3.5" aria-hidden="true" />
              )}
              {forced ? 'Close anyway' : 'Close bead'}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  )
}
