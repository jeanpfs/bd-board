import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { toast } from 'sonner'

import { Button } from '@/components/ui/button'
import { getConfigFn, setConfigFn } from '@/lib/server'
import { cn } from '@/lib/utils'

import type { Project } from '@/lib/types'

interface GeneralSectionProps {
  project: Project
}

/** Project facts plus the live-updates switch (bd's events journal). */
export function GeneralSection({ project }: GeneralSectionProps) {
  const queryClient = useQueryClient()
  const journalQuery = useQuery({
    queryKey: ['config', project.id, 'events-journal'],
    queryFn: () =>
      getConfigFn({ data: { project: project.id, key: 'events-journal' } }),
    retry: false,
  })
  const enabled = journalQuery.data === 'true'

  const toggle = useMutation({
    mutationFn: (next: boolean) =>
      setConfigFn({
        data: {
          project: project.id,
          key: 'events-journal',
          value: next ? 'true' : 'false',
        },
      }),
    onSuccess: (_result, next) => {
      queryClient.setQueryData(
        ['config', project.id, 'events-journal'],
        next ? 'true' : 'false',
      )
      queryClient.invalidateQueries({ queryKey: ['beads', project.id] })
      toast.success(next ? 'Live updates on' : 'Live updates off')
    },
    onError: (error) =>
      toast.error(error instanceof Error ? error.message : String(error)),
  })

  return (
    <>
      <div className="flex flex-col gap-3">
        <h2 className="text-title font-semibold text-foreground">General</h2>
        <dl className="grid grid-cols-[120px_1fr] gap-x-4 gap-y-2 text-body">
          <dt className="text-muted-foreground">Name</dt>
          <dd className="text-foreground">{project.name}</dd>
          <dt className="text-muted-foreground">Prefix</dt>
          <dd className="font-mono text-foreground">{project.prefix ?? '—'}</dd>
          <dt className="text-muted-foreground">Path</dt>
          <dd className="truncate font-mono text-xs text-foreground">
            {project.dir}
          </dd>
        </dl>
      </div>

      <div className="flex flex-col gap-3 rounded-lg border border-border p-4">
        <h3 className="text-body font-semibold text-foreground">
          Live updates
        </h3>
        <div className="flex items-center justify-between gap-4">
          <div className="flex flex-col gap-0.5">
            <span
              id="events-journal-label"
              className="text-body text-foreground"
            >
              Events journal
            </span>
            <span className="text-xs text-muted-foreground">
              Lets the inbox and the board receive changes as they happen.
            </span>
          </div>
          <Button
            type="button"
            role="switch"
            aria-checked={enabled}
            aria-labelledby="events-journal-label"
            aria-busy={toggle.isPending}
            disabled={
              journalQuery.isPending || journalQuery.isError || toggle.isPending
            }
            onClick={() => toggle.mutate(!enabled)}
            variant="outline"
            size="sm"
            className={cn(enabled && 'border-primary/60')}
          >
            {enabled ? 'On' : 'Off'}
          </Button>
        </div>
        {journalQuery.isError ? (
          <p className="text-xs text-destructive">
            Could not read the events journal setting.
          </p>
        ) : null}
        <p className="text-xs text-muted-foreground">
          Safety refetch every 60 s while live.
        </p>
      </div>
    </>
  )
}
