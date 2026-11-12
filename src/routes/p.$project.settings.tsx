import { createFileRoute } from '@tanstack/react-router'

import { SettingsPage } from '@/components/settings/settings-page'
import { parseSettingsSection } from '@/components/settings/settings-nav'

export const Route = createFileRoute('/p/$project/settings')({
  validateSearch: (search: Record<string, unknown>) => ({
    section: parseSettingsSection(search.section),
  }),
  component: SettingsRoute,
})

function SettingsRoute() {
  const { project } = Route.useParams()
  const { section } = Route.useSearch()
  return <SettingsPage project={project} section={section} />
}
