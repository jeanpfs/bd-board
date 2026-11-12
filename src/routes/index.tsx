import { useEffect, useMemo, useState } from 'react'
import { Link, createFileRoute } from '@tanstack/react-router'
import { useQuery } from '@tanstack/react-query'
import { AlertCircle, FolderOpen, Plus } from 'lucide-react'

import { DesktopProbeCard } from '@/components/desktop-probe-card'
import { AttentionAction } from '@/components/attention-action'
import { EditProjectModal } from '@/components/edit-project-modal'
import {
  AttentionBlock,
  AttentionRow,
  Section,
} from '@/components/home-sections'
import { BeadLinkRow, MyWorkList, myWorkItems } from '@/components/my-work'
import type { Located } from '@/components/my-work'
import { ProjectCard } from '@/components/project-card'
import { Button } from '@/components/ui/button'
import { Card } from '@/components/ui/card'
import { Skeleton } from '@/components/ui/skeleton'
import { useAllProjectBeads } from '@/hooks/use-all-project-beads'
import { useProjectActions } from '@/hooks/use-project-actions'
import {
  ATTENTION_ORDER,
  attentionList,
  projectHeadline,
  projectProblem,
} from '@/lib/attention'
import { getStoredIdentity } from '@/lib/identity'
import { isGate } from '@/lib/lease'
import { getProjects } from '@/lib/server'
import { PROJECTS_REFETCH_MS } from '@/lib/polling'
import { relativeDate } from '@/lib/time'
import { statusText } from '@/lib/types'
import { useValidateProjectsOnMount } from '@/lib/useValidateProjectsOnMount'

import type { Bead, Project } from '@/lib/types'

export const Route = createFileRoute('/')({ component: Home })

const NEEDS_YOU_LIMIT = 6
const MY_WORK_LIMIT = 8
const RECENT_LIMIT = 5

function Home() {
  const { data, isPending, isError, error, refetch, isFetching } = useQuery({
    queryKey: ['projects'],
    queryFn: () => getProjects(),
    refetchInterval: PROJECTS_REFETCH_MS,
    staleTime: 5000,
  })

  const { currentBrokenProject, closeBrokenModal } =
    useValidateProjectsOnMount(data)

  return (
    <>
      {currentBrokenProject ? (
        <EditProjectModal
          open={true}
          onOpenChange={closeBrokenModal}
          project={currentBrokenProject.project}
          isRepair={true}
        />
      ) : null}
      {!isPending && !isError && data.length === 0 ? (
        <StartScreen />
      ) : (
        <div className="mx-auto flex max-w-[1160px] flex-col gap-section pb-page">
          <PageHeader />
          <DesktopProbeCard />

          {isPending ? (
            <LoadingState />
          ) : isError ? (
            <ErrorState
              message={error instanceof Error ? error.message : String(error)}
              onRetry={() => refetch()}
              retrying={isFetching}
            />
          ) : (
            <Dashboard projects={data} />
          )}
        </div>
      )}
    </>
  )
}

function PageHeader() {
  const { handleOpenProject, handleInitProject } = useProjectActions()

  return (
    <header className="flex items-center justify-between gap-4">
      <h1 className="text-title font-semibold tracking-[-0.01em]">Home</h1>
      <div className="flex gap-2">
        <Button size="sm" variant="ghost" onClick={handleInitProject}>
          <Plus className="size-4" />
          Init project
        </Button>
        <Button size="sm" onClick={handleOpenProject}>
          <FolderOpen className="size-4" />
          Open project
        </Button>
      </div>
    </header>
  )
}

function Dashboard({ projects }: { projects: Project[] }) {
  const beadsByProject = useAllProjectBeads(projects)
  const [repairing, setRepairing] = useState<Project | null>(null)
  const [identity, setIdentity] = useState<string | null>(null)
  useEffect(() => {
    setIdentity(getStoredIdentity())
  }, [])

  const located = useMemo(() => {
    const all: Located[] = []
    projects.forEach((project, index) => {
      for (const bead of beadsByProject.get(project.id) ?? []) {
        all.push({ bead, project, index })
      }
    })
    return all
  }, [projects, beadsByProject])

  const byUrgency = useMemo(
    () =>
      projects
        .map((project, index) => ({
          project,
          index,
          headline: projectHeadline(project, beadsByProject.get(project.id)),
        }))
        .sort(
          (a, b) =>
            a.headline.rank - b.headline.rank ||
            (b.headline.value ?? 0) - (a.headline.value ?? 0),
        ),
    [projects, beadsByProject],
  )

  const mine = myWorkItems(located, identity)

  return (
    <>
      <NeedsYou
        projects={projects}
        beadsByProject={beadsByProject}
        onRepair={setRepairing}
      />

      <Section title="Projects" meta="by urgency">
        <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-3">
          {byUrgency.map(({ project, index }) => (
            <ProjectCard
              key={project.id}
              project={project}
              index={index}
              beads={beadsByProject.get(project.id)}
            />
          ))}
        </div>
      </Section>

      <div className="grid gap-x-12 gap-y-section lg:grid-cols-2">
        <Section title="My work" meta={identity ? mine.length : undefined}>
          <MyWorkList items={mine} identity={identity} limit={MY_WORK_LIMIT} />
        </Section>
        <RecentlyUpdated located={located} />
      </div>

      {repairing ? (
        <EditProjectModal
          open={true}
          onOpenChange={(open) => !open && setRepairing(null)}
          project={repairing}
          isRepair={true}
        />
      ) : null}
    </>
  )
}

function NeedsYou({
  projects,
  beadsByProject,
  onRepair,
}: {
  projects: Project[]
  beadsByProject: Map<string, Bead[]>
  onRepair: (project: Project) => void
}) {
  const now = useMemo(() => Date.now(), [beadsByProject])
  const rows: React.ReactNode[] = []

  for (const project of projects) {
    const problem = projectProblem(project)
    if (!problem) continue
    rows.push(
      <AttentionRow
        key={`project:${project.id}`}
        kind={problem.kind}
        title={project.name}
        meta={problem.label}
        action={
          problem.kind === 'missing' ? (
            <Button
              size="sm"
              variant="outline"
              onClick={() => onRepair(project)}
            >
              Fix path
            </Button>
          ) : (
            <Button size="sm" variant="outline" asChild>
              <Link to="/p/$project" params={{ project: project.id }}>
                Open
              </Link>
            </Button>
          )
        }
      />,
    )
  }

  const beadItems = projects
    .flatMap((project) =>
      attentionList(beadsByProject.get(project.id) ?? [], now).map((a) => ({
        ...a,
        project,
      })),
    )
    // attentionList orders within a project; re-rank across projects.
    .sort(
      (a, b) =>
        ATTENTION_ORDER.indexOf(a.kind) - ATTENTION_ORDER.indexOf(b.kind) ||
        a.bead.priority - b.bead.priority,
    )

  for (const { kind, bead, detail, project, gateId } of beadItems) {
    rows.push(
      <AttentionRow
        key={`${project.id}:${bead.id}`}
        kind={kind}
        id={bead.id}
        title={bead.title}
        meta={[project.name, detail, bead.assignee].filter(Boolean).join(' · ')}
        action={
          <AttentionAction
            item={{ kind, bead, detail, gateId }}
            project={project.id}
            fallback={
              <Button size="sm" variant="outline" asChild>
                <Link
                  to="/p/$project"
                  params={{ project: project.id }}
                  search={{ bead: bead.id }}
                >
                  Open
                </Link>
              </Button>
            }
          />
        }
      />,
    )
  }

  const shown = rows.slice(0, NEEDS_YOU_LIMIT)
  return (
    <AttentionBlock
      title="Needs you"
      meta={
        rows.length > shown.length
          ? `${shown.length} of ${rows.length}, most urgent first`
          : `${rows.length}, most urgent first`
      }
      empty="Nothing needs you: no open P0, nothing overdue, nothing blocked or stale, every project readable."
    >
      {shown}
    </AttentionBlock>
  )
}

function RecentlyUpdated({ located }: { located: Located[] }) {
  const recent = useMemo(
    () =>
      located
        .filter(({ bead }) => bead.updated_at && !isGate(bead))
        .sort((a, b) =>
          (b.bead.updated_at ?? '').localeCompare(a.bead.updated_at ?? ''),
        )
        .slice(0, RECENT_LIMIT),
    [located],
  )

  if (recent.length === 0) return null
  return (
    <Section title="Recently updated">
      <ul className="flex flex-col">
        {recent.map((item) => (
          <BeadLinkRow
            key={`${item.project.id}:${item.bead.id}`}
            item={item}
            trailing={`${statusText(item.bead)} · ${relativeDate(item.bead.updated_at)}`}
          />
        ))}
      </ul>
    </Section>
  )
}

function LoadingState() {
  return (
    <div className="flex flex-col gap-section">
      <Skeleton className="h-28 w-full rounded-xl" />
      <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-3">
        {Array.from({ length: 3 }).map((_, i) => (
          <div key={i} className="flex flex-col gap-3 rounded-xl bg-card p-4">
            <Skeleton className="h-5 w-28" />
            <Skeleton className="h-7 w-20" />
            <Skeleton className="h-3 w-40" />
          </div>
        ))}
      </div>
    </div>
  )
}

function ErrorState({
  message,
  onRetry,
  retrying,
}: {
  message: string
  onRetry: () => void
  retrying: boolean
}) {
  return (
    <Card className="items-start gap-3 border-destructive/30 p-4">
      <div className="flex items-start gap-2.5">
        <AlertCircle
          className="mt-0.5 size-4 shrink-0 text-destructive"
          aria-hidden="true"
        />
        <div className="flex flex-col gap-0.5">
          <p className="text-sm font-medium">Could not load projects</p>
          <p className="text-xs text-muted-foreground">{message}</p>
        </div>
      </div>
      <Button size="sm" variant="outline" onClick={onRetry} disabled={retrying}>
        {retrying ? 'Retrying...' : 'Try again'}
      </Button>
    </Card>
  )
}

/** First run: nothing registered yet, so the only job is to start or open one. */
function StartScreen() {
  const { handleOpenProject, handleInitProject } = useProjectActions()

  return (
    <section
      aria-labelledby="start-screen-title"
      className="mx-auto flex min-h-[70dvh] max-w-md flex-col justify-center gap-6"
    >
      <DesktopProbeCard />
      <div className="flex flex-col items-center gap-4 text-center">
        <span className="flex size-10 items-center justify-center rounded-lg bg-muted text-muted-foreground">
          <FolderOpen className="size-5" aria-hidden="true" />
        </span>
        <div className="flex flex-col gap-1.5">
          <h1
            id="start-screen-title"
            className="text-title font-semibold tracking-[-0.01em]"
          >
            Start with a project
          </h1>
          <p className="text-body text-muted-foreground">
            Open a folder that already uses beads, or initialize beads in a new
            one.
          </p>
        </div>
        <div className="flex gap-2">
          <Button variant="ghost" onClick={handleInitProject}>
            <Plus className="size-4" />
            Init project
          </Button>
          <Button onClick={handleOpenProject}>
            <FolderOpen className="size-4" />
            Open project
          </Button>
        </div>
      </div>
    </section>
  )
}
