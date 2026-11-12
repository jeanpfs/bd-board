import {
  useEffect,
  useMemo,
  useRef,
  useState,
  useSyncExternalStore,
} from 'react'
import { useNavigate, useParams, useSearch } from '@tanstack/react-router'
import { useQuery, useQueryClient } from '@tanstack/react-query'
import {
  Circle,
  Folder,
  GitBranch,
  Home,
  Inbox,
  ListChecks,
  Plus,
} from 'lucide-react'
import { toast } from 'sonner'

import { CloseBeadDialog } from '@/components/close-bead-dialog'
import { PriorityBadge } from '@/components/priority-badge'
import { openShortcutsDialog } from '@/components/shortcuts-dialog'
import {
  Command,
  CommandDialog,
  CommandEmpty,
  CommandGroup,
  CommandInput,
  CommandItem,
  CommandList,
} from '@/components/ui/command'
import { Kbd } from '@/components/ui/kbd'
import { useAllProjectBeads } from '@/hooks/use-all-project-beads'
import { branchName, matchRange, searchBeads } from '@/lib/command-search'
import { isGate } from '@/lib/lease'
import { isMacPlatform } from '@/lib/platform'
import type { CommandBeadItem } from '@/lib/command-search'
import { closeRefusalReason } from '@/lib/close-policy'
import { getProjects, updateBeadStatusFn } from '@/lib/server'
import { patchCachedBead } from '@/lib/optimistic'
import { COLUMNS, isEpic, statusText } from '@/lib/types'
import { toErrorMessage } from '@/lib/utils'

import type { Bead, BeadColumn, Project } from '@/lib/types'

/* ---------- open state, shared with anything that opens the palette ---------- */

let paletteOpen = false
const paletteListeners = new Set<() => void>()

function setPaletteOpen(next: boolean) {
  if (paletteOpen === next) return
  paletteOpen = next
  paletteListeners.forEach((listener) => listener())
}

/** Opens the command palette. Task 6's help dialog uses this; the palette owns `Mod K`. */
export function openCommandPalette() {
  setPaletteOpen(true)
}

function usePaletteOpen(): boolean {
  return useSyncExternalStore(
    (listener) => {
      paletteListeners.add(listener)
      return () => paletteListeners.delete(listener)
    },
    () => paletteOpen,
    () => false,
  )
}

/* ---------- helpers ---------- */

function isDesktop(): boolean {
  return typeof window !== 'undefined' && '__TAURI_INTERNALS__' in window
}

function projectHref(project: string, search: Record<string, string>) {
  return `/p/${encodeURIComponent(project)}?${new URLSearchParams(search).toString()}`
}

function beadMeta(bead: Bead): string {
  if (isEpic(bead)) {
    const children = bead.childBeads ?? []
    const done = children.filter((c) => c.status === 'closed').length
    return `Epic · ${done}/${children.length} done`
  }
  const status = statusText(bead)
  return bead.assignee ? `${status} · ${bead.assignee}` : status
}

function Highlighted({ text, query }: { text: string; query: string }) {
  const hit = matchRange(text, query)
  if (!hit) return <>{text}</>
  const [start, end] = hit
  return (
    <>
      {text.slice(0, start)}
      <span className="text-primary-text">{text.slice(start, end)}</span>
      {text.slice(end)}
    </>
  )
}

/* ---------- palette ---------- */

interface CloseTarget {
  bead: Bead
  project: string
  refusal: string
}

export function CommandPalette() {
  const open = usePaletteOpen()
  const { project: routeProject } = useParams({ strict: false })
  const search = useSearch({ strict: false })
  const navigate = useNavigate()
  const queryClient = useQueryClient()

  const [query, setQuery] = useState('')
  const [statusPage, setStatusPage] = useState(false)
  const [closeTarget, setCloseTarget] = useState<CloseTarget | null>(null)
  const [mac] = useState(isMacPlatform)
  const desktop = isDesktop()
  const newTabRef = useRef(false)

  const projectsQuery = useQuery({
    queryKey: ['projects'],
    queryFn: () => getProjects(),
    staleTime: 5000,
    enabled: open,
  })
  const projects = useMemo(() => projectsQuery.data ?? [], [projectsQuery.data])
  const beadsByProject = useAllProjectBeads(open ? projects : [])

  const items = useMemo<CommandBeadItem[]>(() => {
    const out: CommandBeadItem[] = []
    for (const p of projects) {
      for (const bead of beadsByProject.get(p.id) ?? []) {
        if (isGate(bead)) continue
        out.push({ bead, project: p, index: out.length })
      }
    }
    return out
  }, [projects, beadsByProject])

  const focused: { bead: Bead; project: string } | null = (() => {
    if (!routeProject || !search.bead) return null
    const bead = beadsByProject
      .get(routeProject)
      ?.find((b) => b.id === search.bead)
    return bead ? { bead, project: routeProject } : null
  })()

  const scopeName = routeProject
    ? (projects.find((p) => p.id === routeProject)?.name ?? routeProject)
    : null

  // Global Mod+K toggles the palette.
  useEffect(() => {
    function handleKeyDown(event: KeyboardEvent) {
      const mod = isMacPlatform() ? event.metaKey : event.ctrlKey
      if (!mod || event.altKey || event.shiftKey) return
      if (event.key.toLowerCase() !== 'k') return
      event.preventDefault()
      setPaletteOpen(!paletteOpen)
    }
    window.addEventListener('keydown', handleKeyDown)
    return () => window.removeEventListener('keydown', handleKeyDown)
  }, [])

  // Each opening starts fresh on the root page.
  useEffect(() => {
    if (!open) {
      setQuery('')
      setStatusPage(false)
    }
  }, [open])

  const results = useMemo(
    () => searchBeads(query, items, routeProject, 6),
    [query, items, routeProject],
  )

  // cmdk does not filter (see `shouldFilter={false}`), so the action and
  // navigation groups are filtered here by the same label match.
  const trimmed = query.trim()
  const matches = (label: string) =>
    !trimmed || matchRange(label, trimmed) !== null
  const showNewBead = routeProject !== undefined && matches('New bead')
  const showActions =
    showNewBead ||
    (focused !== null &&
      (matches('Change status') || matches('Copy branch name')))
  const showHome = matches('Home')
  const visibleProjects = projects.filter((p) => matches(p.name))
  const showInbox = matches('Inbox')
  const showMyWork = matches('My work')
  const showGoTo =
    showHome || showInbox || showMyWork || visibleProjects.length > 0
  const statusOptions = focused
    ? COLUMNS.filter((c) => c.key !== focused.bead.status)
    : []

  function close() {
    setPaletteOpen(false)
  }

  function openStatusPage() {
    setQuery('')
    setStatusPage(true)
  }

  function openBead(item: CommandBeadItem, newTab: boolean) {
    const id = item.bead.id
    if (newTab) {
      window.open(
        projectHref(item.project.id, { tab: 'board', bead: id }),
        '_blank',
      )
      return
    }
    navigate({
      to: '/p/$project',
      params: { project: item.project.id },
      search: { tab: 'board', bead: id },
    })
  }

  function openProject(p: Project, newTab: boolean) {
    if (newTab) {
      window.open(projectHref(p.id, { tab: 'overview' }), '_blank')
      return
    }
    navigate({
      to: '/p/$project',
      params: { project: p.id },
      search: { tab: 'overview' },
    })
  }

  function goHome(newTab: boolean) {
    if (newTab) window.open('/', '_blank')
    else navigate({ to: '/' })
  }

  function goPage(path: '/inbox' | '/my-work', newTab: boolean) {
    if (newTab) window.open(path, '_blank')
    else navigate({ to: path })
  }

  function newBead() {
    if (!routeProject) return
    navigate({
      to: '/p/$project',
      params: { project: routeProject },
      search: { tab: 'board', new: '1' },
    })
  }

  async function copyBranch(bead: Bead) {
    const branch = branchName(bead)
    try {
      await navigator.clipboard.writeText(branch)
      toast(`Copied ${branch}`)
    } catch (error) {
      toast.error(toErrorMessage(error, 'Could not copy branch name'))
    }
  }

  async function setStatus(
    target: { bead: Bead; project: string },
    status: BeadColumn,
  ) {
    close()
    const undo = await patchCachedBead(
      queryClient,
      target.project,
      target.bead.id,
      { status },
    )
    try {
      await updateBeadStatusFn({
        data: { project: target.project, id: target.bead.id, status },
      })
      toast.success(
        `${target.bead.id} → ${COLUMNS.find((c) => c.key === status)?.label ?? status}`,
      )
    } catch (error) {
      undo()
      const message = toErrorMessage(error, 'Failed to change status')
      const refusal = status === 'closed' ? closeRefusalReason(message) : null
      if (refusal !== null) {
        setCloseTarget({ bead: target.bead, project: target.project, refusal })
      } else {
        toast.error(message)
      }
    } finally {
      queryClient.invalidateQueries({ queryKey: ['beads', target.project] })
    }
  }

  // Enter with Mod opens in a new tab (web only); Backspace on an empty
  // status page returns to the root page.
  function onKeyDown(event: React.KeyboardEvent) {
    const mod = mac ? event.metaKey : event.ctrlKey
    newTabRef.current = event.key === 'Enter' && mod && !desktop
    if (event.key === 'Backspace' && statusPage && !query) {
      setStatusPage(false)
    }
    if (event.key === '?' && !query) {
      event.preventDefault()
      setPaletteOpen(false)
      openShortcutsDialog()
    }
  }

  function takeNewTab() {
    const value = newTabRef.current
    newTabRef.current = false
    return value
  }

  const footerMod = mac ? 'Cmd' : 'Ctrl'

  return (
    <>
      <CommandDialog
        open={open}
        onOpenChange={setPaletteOpen}
        title="Command palette"
        description="Search beads, run actions, go to a project."
        className="top-1/3 w-[640px] max-w-[calc(100vw-2rem)] sm:max-w-[640px]"
      >
        <Command shouldFilter={false}>
          <div className="flex h-[52px] items-center gap-2.5 border-b border-border px-4">
            <CommandInput
              placeholder="Search beads, actions, projects…"
              value={query}
              onValueChange={setQuery}
              onKeyDown={onKeyDown}
              className="h-auto"
            />
            {scopeName && !statusPage ? (
              <span className="shrink-0 text-xs text-muted-foreground">
                in {scopeName}
              </span>
            ) : null}
            <Kbd>Esc</Kbd>
          </div>
          <CommandList className="max-h-[440px] p-1.5">
            {statusPage && focused ? (
              <CommandGroup heading={`Change status of ${focused.bead.id}`}>
                {statusOptions.map((c) => (
                  <CommandItem
                    key={c.key}
                    value={`status:${c.key}`}
                    onSelect={() => setStatus(focused, c.key)}
                  >
                    <Circle
                      className="size-3.5 text-muted-foreground"
                      aria-hidden="true"
                    />
                    {c.label}
                  </CommandItem>
                ))}
              </CommandGroup>
            ) : (
              <>
                <CommandEmpty className="py-6 text-center text-sm text-muted-foreground">
                  No matches.
                </CommandEmpty>
                {results.length > 0 ? (
                  <CommandGroup heading="Beads">
                    {results.map((item) => (
                      <CommandItem
                        key={`${item.project.id}:${item.bead.id}`}
                        value={`bead:${item.project.id}:${item.bead.id}`}
                        onSelect={() => {
                          const useNewTab = takeNewTab()
                          close()
                          openBead(item, useNewTab)
                        }}
                      >
                        <PriorityBadge priority={item.bead.priority} />
                        <span className="font-mono text-xs text-muted-foreground">
                          {item.bead.id}
                        </span>
                        <span className="min-w-0 truncate">
                          <Highlighted text={item.bead.title} query={trimmed} />
                        </span>
                        <span className="ml-auto shrink-0 text-xs text-muted-foreground">
                          {beadMeta(item.bead)}
                        </span>
                      </CommandItem>
                    ))}
                  </CommandGroup>
                ) : null}
                {showActions ? (
                  <CommandGroup heading="Actions">
                    {showNewBead ? (
                      <CommandItem
                        value="action:new-bead"
                        onSelect={() => {
                          close()
                          newBead()
                        }}
                      >
                        <Plus
                          className="size-3.5 text-muted-foreground"
                          aria-hidden="true"
                        />
                        New bead
                        <Kbd className="ml-auto">C</Kbd>
                      </CommandItem>
                    ) : null}
                    {focused && matches('Change status') ? (
                      <CommandItem
                        value="action:change-status"
                        onSelect={() => openStatusPage()}
                      >
                        <Circle
                          className="size-3.5 text-muted-foreground"
                          aria-hidden="true"
                        />
                        Change status of {focused.bead.id}…
                        <Kbd className="ml-auto">S</Kbd>
                      </CommandItem>
                    ) : null}
                    {focused && matches('Copy branch name') ? (
                      <CommandItem
                        value="action:copy-branch"
                        onSelect={() => {
                          close()
                          void copyBranch(focused.bead)
                        }}
                      >
                        <GitBranch
                          className="size-3.5 text-muted-foreground"
                          aria-hidden="true"
                        />
                        Copy branch name
                        <span className="font-mono text-xs text-muted-foreground">
                          {branchName(focused.bead)}
                        </span>
                      </CommandItem>
                    ) : null}
                  </CommandGroup>
                ) : null}
                {showGoTo ? (
                  <CommandGroup heading="Go to">
                    {showHome ? (
                      <CommandItem
                        value="go:home"
                        onSelect={() => {
                          const useNewTab = takeNewTab()
                          close()
                          goHome(useNewTab)
                        }}
                      >
                        <Home
                          className="size-3.5 text-muted-foreground"
                          aria-hidden="true"
                        />
                        Home
                      </CommandItem>
                    ) : null}
                    {showInbox ? (
                      <CommandItem
                        value="go:inbox"
                        onSelect={() => {
                          const useNewTab = takeNewTab()
                          close()
                          goPage('/inbox', useNewTab)
                        }}
                      >
                        <Inbox
                          className="size-3.5 text-muted-foreground"
                          aria-hidden="true"
                        />
                        Inbox
                      </CommandItem>
                    ) : null}
                    {showMyWork ? (
                      <CommandItem
                        value="go:my-work"
                        onSelect={() => {
                          const useNewTab = takeNewTab()
                          close()
                          goPage('/my-work', useNewTab)
                        }}
                      >
                        <ListChecks
                          className="size-3.5 text-muted-foreground"
                          aria-hidden="true"
                        />
                        My work
                      </CommandItem>
                    ) : null}
                    {visibleProjects.map((p) => (
                      <CommandItem
                        key={p.id}
                        value={`go:project:${p.id}`}
                        onSelect={() => {
                          const useNewTab = takeNewTab()
                          close()
                          openProject(p, useNewTab)
                        }}
                      >
                        <Folder
                          className="size-3.5 text-muted-foreground"
                          aria-hidden="true"
                        />
                        {p.name}
                        <span className="text-xs text-muted-foreground">
                          {beadsByProject.get(p.id)?.length ?? p.counts.total}{' '}
                          beads
                        </span>
                      </CommandItem>
                    ))}
                  </CommandGroup>
                ) : null}
              </>
            )}
          </CommandList>
          <div className="flex h-10 items-center gap-4 whitespace-nowrap border-t border-border px-4 text-xs text-muted-foreground">
            <span className="inline-flex items-center gap-1.5">
              <Kbd>↑</Kbd>
              <Kbd>↓</Kbd> navigate
            </span>
            <span className="inline-flex items-center gap-1.5">
              <Kbd>Enter</Kbd> open
            </span>
            {desktop ? null : (
              <span className="inline-flex items-center gap-1.5">
                <Kbd>{footerMod} Enter</Kbd> open in new tab
              </span>
            )}
            <span className="inline-flex items-center gap-1.5">
              <Kbd>?</Kbd> all shortcuts
            </span>
          </div>
        </Command>
      </CommandDialog>
      {closeTarget ? (
        <CloseBeadDialog
          key={`${closeTarget.project}:${closeTarget.bead.id}`}
          project={closeTarget.project}
          beads={[closeTarget.bead]}
          open
          onOpenChange={(next) => {
            if (!next) setCloseTarget(null)
          }}
          refusal={closeTarget.refusal}
        />
      ) : null}
    </>
  )
}
