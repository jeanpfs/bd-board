import { useState } from 'react'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { toast } from 'sonner'

import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { getConfigFn, setConfigFn } from '@/lib/server'

interface AgentsPoolsSectionProps {
  project: string
}

/** Claim pools: the `claim.pools` assignee list, one comma-separated value. */
export function AgentsPoolsSection({ project }: AgentsPoolsSectionProps) {
  const poolsQuery = useQuery({
    queryKey: ['config', project, 'claim.pools'],
    queryFn: () => getConfigFn({ data: { project, key: 'claim.pools' } }),
    retry: false,
  })

  if (poolsQuery.isPending) {
    return <p className="text-body text-muted-foreground">Loading pools…</p>
  }
  if (poolsQuery.isError) {
    return (
      <p className="text-body text-destructive">
        Could not read the claim pools.
      </p>
    )
  }
  return (
    <PoolsEditor
      key={poolsQuery.data}
      project={project}
      saved={poolsQuery.data}
    />
  )
}

function PoolsEditor({ project, saved }: { project: string; saved: string }) {
  const queryClient = useQueryClient()
  const [draft, setDraft] = useState(saved)
  const [error, setError] = useState<string | null>(null)
  const dirty = draft.trim() !== saved.trim()

  const save = useMutation({
    mutationFn: () =>
      setConfigFn({
        data: { project, key: 'claim.pools', value: draft.trim() },
      }),
    onSuccess: () => {
      setError(null)
      queryClient.invalidateQueries({
        queryKey: ['config', project, 'claim.pools'],
      })
      queryClient.invalidateQueries({ queryKey: ['beads', project] })
      toast.success('Pools saved')
    },
    onError: (err) =>
      setError(err instanceof Error ? err.message : String(err)),
  })

  return (
    <div className="flex flex-col gap-5">
      <div className="flex flex-col gap-1">
        <h2 className="text-title font-semibold text-foreground">
          Agents &amp; pools
        </h2>
        <p className="text-body text-muted-foreground">
          Assignees that bd may claim work for. Separate names with commas;
          leave it empty to clear the pools.
        </p>
      </div>

      <div className="flex flex-col gap-2 rounded-lg border border-border p-4">
        <label htmlFor="claim-pools" className="text-body text-foreground">
          Claim pools
        </label>
        <Input
          id="claim-pools"
          value={draft}
          placeholder="agent-a, agent-b"
          onChange={(event) => setDraft(event.target.value)}
          className="font-mono"
        />
      </div>

      <p className="rounded-md bg-white/5 px-3 py-2 font-mono text-xs text-muted-foreground">
        $ bd config set claim.pools &quot;{draft.trim()}&quot;
      </p>

      {error ? <p className="text-body text-destructive">{error}</p> : null}

      <div className="flex items-center justify-end gap-2">
        <Button
          type="button"
          variant="ghost"
          disabled={!dirty || save.isPending}
          onClick={() => {
            setDraft(saved)
            setError(null)
          }}
        >
          Discard
        </Button>
        <Button
          type="button"
          disabled={!dirty || save.isPending}
          onClick={() => save.mutate()}
        >
          Save changes
        </Button>
      </div>
    </div>
  )
}
