import { createFileRoute } from '@tanstack/react-router'
import { useQuery } from '@tanstack/react-query'
import { AlertCircle, FolderOpen } from 'lucide-react'

import { ProjectCard } from '@/components/project-card'
import { Button } from '@/components/ui/button'
import { Card } from '@/components/ui/card'
import { Skeleton } from '@/components/ui/skeleton'
import { getProjects } from '@/lib/server'

import type { Project } from '@/lib/types'

export const Route = createFileRoute('/')({ component: Home })

function Home() {
  const { data, isPending, isError, error, refetch, isFetching } = useQuery({
    queryKey: ['projects'],
    queryFn: () => getProjects(),
    refetchInterval: 15000,
    staleTime: 5000,
  })

  return (
    <div className="flex flex-col gap-6">
      <PageHeader projects={data} />

      {isPending ? (
        <LoadingGrid />
      ) : isError ? (
        <ErrorState
          message={error instanceof Error ? error.message : String(error)}
          onRetry={() => refetch()}
          retrying={isFetching}
        />
      ) : data.length === 0 ? (
        <EmptyState />
      ) : (
        <ProjectGrid projects={data} />
      )}
    </div>
  )
}

function PageHeader({ projects }: { projects: Project[] | undefined }) {
  const count = projects?.length ?? 0
  const beads = projects?.reduce((sum, p) => sum + p.counts.total, 0) ?? 0

  return (
    <header className="flex flex-col gap-1">
      <h1 className="text-xl font-semibold tracking-tight">Projetos</h1>
      {projects ? (
        <p className="text-sm text-muted-foreground">
          {count} {count === 1 ? 'projeto' : 'projetos'}
          <span className="px-1.5 text-muted-foreground/50">·</span>
          {beads.toLocaleString('pt-BR')} {beads === 1 ? 'bead' : 'beads'}
        </p>
      ) : (
        <Skeleton className="h-4 w-40" />
      )}
    </header>
  )
}

function ProjectGrid({ projects }: { projects: Project[] }) {
  const sorted = [...projects].sort((a, b) => b.counts.total - a.counts.total)

  return (
    <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-3">
      {sorted.map((project) => (
        <ProjectCard key={project.database} project={project} />
      ))}
    </div>
  )
}

function LoadingGrid() {
  return (
    <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-3">
      {Array.from({ length: 6 }).map((_, i) => (
        <Card key={i} className="gap-3">
          <div className="flex items-center justify-between px-4">
            <Skeleton className="h-5 w-32" />
            <Skeleton className="h-4 w-16" />
          </div>
          <div className="flex flex-col gap-3 px-4">
            <Skeleton className="h-2 w-full rounded-full" />
            <div className="flex gap-3">
              <Skeleton className="h-3 w-16" />
              <Skeleton className="h-3 w-20" />
              <Skeleton className="h-3 w-16" />
              <Skeleton className="h-3 w-16" />
            </div>
          </div>
        </Card>
      ))}
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
          <p className="text-sm font-medium">Não foi possível carregar os projetos</p>
          <p className="text-xs text-muted-foreground">{message}</p>
        </div>
      </div>
      <Button
        size="sm"
        variant="outline"
        onClick={onRetry}
        disabled={retrying}
      >
        {retrying ? 'Tentando…' : 'Tentar novamente'}
      </Button>
    </Card>
  )
}

function EmptyState() {
  return (
    <Card className="items-center gap-2 px-4 py-12 text-center">
      <span className="flex size-9 items-center justify-center rounded-lg bg-muted text-muted-foreground">
        <FolderOpen className="size-4.5" aria-hidden="true" />
      </span>
      <p className="text-sm font-medium">Nenhum projeto encontrado</p>
      <p className="max-w-sm text-xs text-muted-foreground">
        Projetos são auto-descobertos de{' '}
        <code className="rounded bg-muted px-1 py-0.5 font-mono text-[0.7rem]">
          ~/Code/*/.beads
        </code>
        . Verifique se há repositórios com metadados de beads.
      </p>
    </Card>
  )
}
