import { Link } from '@tanstack/react-router'

import { isDesktopApp } from '@/lib/server'
import { cn } from '@/lib/utils'

export const SETTINGS_SECTIONS = [
  'general',
  'statuses',
  'agents',
  'danger',
] as const

export type SettingsSection = (typeof SETTINGS_SECTIONS)[number]

const LABEL: Record<SettingsSection, string> = {
  general: 'General',
  statuses: 'Statuses',
  agents: 'Agents & pools',
  danger: 'Danger zone',
}

export function parseSettingsSection(value: unknown): SettingsSection {
  return SETTINGS_SECTIONS.includes(value as SettingsSection)
    ? (value as SettingsSection)
    : 'general'
}

interface SettingsNavProps {
  project: string
  active: SettingsSection
}

/** Project settings sections. The danger zone exists only in the desktop app. */
export function SettingsNav({ project, active }: SettingsNavProps) {
  const sections = SETTINGS_SECTIONS.filter(
    (section) => section !== 'danger' || isDesktopApp(),
  )
  return (
    <nav aria-label="Settings sections" className="w-46 shrink-0">
      <p className="px-2 pb-2 text-badge font-medium text-faint">Project</p>
      <ul className="flex flex-col gap-0.5">
        {sections.map((section) => (
          <li key={section}>
            <Link
              to="/p/$project/settings"
              params={{ project }}
              search={{ section }}
              aria-current={active === section ? 'page' : undefined}
              className={cn(
                'block rounded-md px-2 py-1.5 text-body outline-none focus-visible:ring-2 focus-visible:ring-ring/60',
                active === section
                  ? 'bg-white/9 text-foreground'
                  : 'text-muted-foreground hover:text-foreground',
                section === 'danger' && 'text-destructive',
              )}
            >
              {LABEL[section]}
            </Link>
          </li>
        ))}
      </ul>
    </nav>
  )
}
