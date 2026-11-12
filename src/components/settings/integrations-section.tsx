import { useState } from 'react'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { toast } from 'sonner'

import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { ToggleGroup, ToggleGroupItem } from '@/components/ui/toggle-group'
import type {
  LinearDirection,
  LinearStatus,
  LinearSyncResult,
} from '@/lib/linear'
import {
  getConfigFn,
  linearStatusFn,
  linearSyncFn,
  setConfigFn,
} from '@/lib/server'
import { cn } from '@/lib/utils'

const DIRECTIONS: { value: LinearDirection; label: string }[] = [
  { value: 'pull', label: 'Pull' },
  { value: 'push', label: 'Push' },
  { value: 'both', label: 'Both ways' },
]

interface IntegrationsSectionProps {
  project: string
}

/** Linear integration: connection status, access settings, sync controls. */
export function IntegrationsSection({ project }: IntegrationsSectionProps) {
  const statusQuery = useQuery({
    queryKey: ['linear', project],
    queryFn: () => linearStatusFn({ data: { project } }),
    retry: false,
  })
  const idsQuery = useQuery({
    queryKey: ['linear-ids', project],
    queryFn: async () => ({
      teamId: await getConfigFn({
        data: { project, key: 'linear.team_id' },
      }),
      projectId: await getConfigFn({
        data: { project, key: 'linear.project_id' },
      }),
    }),
    retry: false,
  })

  if (statusQuery.isPending || idsQuery.isPending) {
    return <p className="text-body text-muted-foreground">Loading Linear…</p>
  }
  if (statusQuery.isError || idsQuery.isError) {
    return (
      <p className="text-body text-destructive">
        Could not read the Linear settings.
      </p>
    )
  }
  return (
    <LinearPanel
      project={project}
      status={statusQuery.data}
      savedTeamId={idsQuery.data.teamId}
      savedProjectId={idsQuery.data.projectId}
    />
  )
}

/** bd refuses to write a secret into a git-tracked config.yaml; say what to do instead. */
export function saveKeyErrorMessage(err: unknown): string {
  const message = err instanceof Error ? err.message : String(err)
  if (/git-tracked config/i.test(message)) {
    return "bd won't save the key: the project's .beads/config.yaml is tracked by git, so the key would be committed. Set LINEAR_API_KEY in the environment that runs bd board, or untrack the config file."
  }
  return message
}

interface LinearPanelProps {
  project: string
  status: LinearStatus
  savedTeamId: string
  savedProjectId: string
}

function LinearPanel({
  project,
  status,
  savedTeamId,
  savedProjectId,
}: LinearPanelProps) {
  const queryClient = useQueryClient()
  const [apiKey, setApiKey] = useState('')
  const [teamId, setTeamId] = useState(savedTeamId)
  const [projectId, setProjectId] = useState(savedProjectId)
  const [direction, setDirection] = useState<LinearDirection>('both')
  const [relations, setRelations] = useState(false)
  const [result, setResult] = useState<LinearSyncResult | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [keyError, setKeyError] = useState<string | null>(null)
  const configured = status.configured

  function refreshLinear() {
    queryClient.invalidateQueries({ queryKey: ['linear', project] })
  }

  function reportError(err: unknown) {
    setError(err instanceof Error ? err.message : String(err))
  }

  const saveKey = useMutation({
    mutationFn: () =>
      setConfigFn({
        data: { project, key: 'linear.api_key', value: apiKey.trim() },
      }),
    onMutate: () => setKeyError(null),
    onSuccess: () => {
      setApiKey('')
      setError(null)
      refreshLinear()
      toast.success('Linear API key saved')
    },
    onError: (err) => setKeyError(saveKeyErrorMessage(err)),
  })

  const saveAccess = useMutation({
    mutationFn: async () => {
      await setConfigFn({
        data: { project, key: 'linear.team_id', value: teamId.trim() },
      })
      await setConfigFn({
        data: { project, key: 'linear.project_id', value: projectId.trim() },
      })
    },
    onSuccess: () => {
      setError(null)
      refreshLinear()
      toast.success('Linear access saved')
    },
    onError: reportError,
    onSettled: () => {
      queryClient.invalidateQueries({ queryKey: ['linear-ids', project] })
    },
  })

  const sync = useMutation({
    mutationFn: (dryRun: boolean) =>
      linearSyncFn({ data: { project, direction, relations, dryRun } }),
    onSuccess: (synced, dryRun) => {
      setError(null)
      setResult(synced)
      if (!dryRun) {
        refreshLinear()
        queryClient.invalidateQueries({ queryKey: ['beads', project] })
      }
    },
    onError: reportError,
  })

  const busy = saveKey.isPending || saveAccess.isPending || sync.isPending

  return (
    <div className="flex flex-col gap-6">
      <div className="flex flex-col gap-1">
        <div className="flex items-center gap-2">
          <h2 className="text-body font-semibold text-foreground">Linear</h2>
          <span
            className={cn(
              'flex items-center gap-1.5 text-badge',
              configured ? 'text-foreground' : 'text-faint',
            )}
          >
            <span aria-hidden className="size-2 rounded-full bg-current" />
            {configured ? 'Connected' : 'Not configured'}
          </span>
        </div>
        <p className="text-body text-muted-foreground">
          Syncs beads with Linear issues through bd linear sync.{' '}
          {status.with_linear_ref} beads are linked and {status.pending_push}{' '}
          are waiting to push.
        </p>
      </div>

      <section className="flex flex-col gap-3">
        <h3 className="text-body font-semibold text-foreground">Sync</h3>
        <div className="flex flex-col divide-y divide-border">
          <div className="flex items-center justify-between gap-4 py-3">
            <Label className="text-body text-foreground">Direction</Label>
            <ToggleGroup
              type="single"
              aria-label="Sync direction"
              value={direction}
              onValueChange={(value) => {
                if (value !== '') setDirection(value as LinearDirection)
              }}
            >
              {DIRECTIONS.map((option) => (
                <ToggleGroupItem key={option.value} value={option.value}>
                  {option.label}
                </ToggleGroupItem>
              ))}
            </ToggleGroup>
          </div>
          <label className="flex items-center gap-2 py-3 text-body text-foreground">
            <input
              type="checkbox"
              checked={relations}
              onChange={(event) => setRelations(event.target.checked)}
            />
            Import Linear relations as dependencies
          </label>
        </div>
      </section>

      <section className="flex flex-col gap-3">
        <h3 className="text-body font-semibold text-foreground">Access</h3>
        <div className="flex flex-col divide-y divide-border">
          <div className="flex flex-col gap-2 py-3">
            <Label
              htmlFor="linear-api-key"
              className="text-body text-foreground"
            >
              API key
            </Label>
            <div className="flex gap-2">
              <Input
                id="linear-api-key"
                type="password"
                autoComplete="off"
                value={apiKey}
                placeholder={
                  status.has_api_key ? 'lin_api_…' : 'Paste a Linear API key'
                }
                onChange={(event) => setApiKey(event.target.value)}
                className="font-mono"
              />
              <Button
                type="button"
                variant="outline"
                disabled={apiKey.trim() === '' || busy}
                onClick={() => saveKey.mutate()}
              >
                Save key
              </Button>
            </div>
            {keyError ? (
              <p role="alert" className="text-body text-destructive">
                {keyError}
              </p>
            ) : null}
          </div>
          <div className="flex flex-col gap-2 py-3">
            <Label
              htmlFor="linear-team-id"
              className="text-body text-foreground"
            >
              Team id
            </Label>
            <Input
              id="linear-team-id"
              value={teamId}
              placeholder="ENG"
              onChange={(event) => setTeamId(event.target.value)}
              className="font-mono"
            />
          </div>
          <div className="flex flex-col gap-2 py-3">
            <Label
              htmlFor="linear-project-id"
              className="text-body text-foreground"
            >
              Project id <span className="text-faint">(optional)</span>
            </Label>
            <Input
              id="linear-project-id"
              value={projectId}
              onChange={(event) => setProjectId(event.target.value)}
              className="font-mono"
            />
          </div>
        </div>
        <div className="flex justify-end">
          <Button
            type="button"
            variant="outline"
            disabled={busy}
            onClick={() => saveAccess.mutate()}
          >
            Save access
          </Button>
        </div>
      </section>

      <section className="flex flex-col gap-3">
        <h3 className="text-body font-semibold text-foreground">Mapping</h3>
        <dl className="flex flex-col divide-y divide-border text-body">
          <div className="flex items-center justify-between py-3">
            <dt className="text-muted-foreground">Issues in bd</dt>
            <dd className="font-mono text-foreground">{status.total_issues}</dd>
          </div>
          <div className="flex items-center justify-between py-3">
            <dt className="text-muted-foreground">Linked to Linear</dt>
            <dd className="font-mono text-foreground">
              {status.with_linear_ref}
            </dd>
          </div>
          <div className="flex items-center justify-between py-3">
            <dt className="text-muted-foreground">Waiting to push</dt>
            <dd className="font-mono text-foreground">{status.pending_push}</dd>
          </div>
          <div className="flex items-center justify-between py-3">
            <dt className="text-muted-foreground">Last sync</dt>
            <dd className="font-mono text-foreground">
              {status.last_sync === '' ? 'Never' : status.last_sync}
            </dd>
          </div>
        </dl>
      </section>

      {error ? <p className="text-body text-destructive">{error}</p> : null}

      {result ? (
        <pre className="max-h-64 overflow-auto rounded-md border border-border px-3 py-2 font-mono text-xs whitespace-pre-wrap text-muted-foreground">
          {result.output === '' ? '(no output)' : result.output}
          {result.exitCode === 0 ? '' : `\nexit ${result.exitCode}`}
        </pre>
      ) : null}

      <div className="flex items-center justify-end gap-2">
        <Button
          type="button"
          variant="outline"
          disabled={busy}
          onClick={() => sync.mutate(true)}
        >
          Preview dry run
        </Button>
        <Button
          type="button"
          disabled={!configured || busy}
          onClick={() => sync.mutate(false)}
        >
          Sync now
        </Button>
      </div>
    </div>
  )
}
