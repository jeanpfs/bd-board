import { useQuery } from '@tanstack/react-query'

import { AgentsPoolsSection } from '@/components/settings/agents-pools-section'
import { IntegrationsSection } from '@/components/settings/integrations-section'
import { DangerSection } from '@/components/settings/danger-section'
import { GeneralSection } from '@/components/settings/general-section'
import { SettingsNav } from '@/components/settings/settings-nav'
import type { SettingsSection } from '@/components/settings/settings-nav'
import { StatusesSection } from '@/components/settings/statuses-section'
import { getProjects, isDesktopApp } from '@/lib/server'

interface SettingsPageProps {
  project: string
  section: SettingsSection
}

/** Project settings: a section nav beside one pane. */
export function SettingsPage({ project, section }: SettingsPageProps) {
  const projectsQuery = useQuery({
    queryKey: ['projects'],
    queryFn: () => getProjects(),
    refetchInterval: 15000,
    staleTime: 5000,
  })

  if (projectsQuery.isPending) {
    return <p className="p-6 text-body text-muted-foreground">Loading…</p>
  }
  const found = (projectsQuery.data ?? []).find((p) => p.id === project)
  if (!found) {
    return (
      <p className="p-6 text-body text-muted-foreground">Project not found.</p>
    )
  }

  // The web app cannot remove projects, so a danger deep link falls back to General.
  const shown: SettingsSection =
    section === 'danger' && !isDesktopApp() ? 'general' : section

  return (
    <div className="flex min-h-0 flex-1 gap-8 overflow-y-auto p-6">
      <SettingsNav project={project} active={shown} />
      <section className="flex min-w-0 max-w-2xl flex-1 flex-col gap-6">
        {shown === 'general' ? <GeneralSection project={found} /> : null}
        {shown === 'statuses' ? <StatusesSection project={project} /> : null}
        {shown === 'agents' ? <AgentsPoolsSection project={project} /> : null}
        {shown === 'integrations' ? (
          <IntegrationsSection project={project} />
        ) : null}
        {shown === 'danger' ? (
          <DangerSection projectId={project} projectName={found.name} />
        ) : null}
      </section>
    </div>
  )
}
