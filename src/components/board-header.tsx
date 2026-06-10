import { Link } from '@tanstack/react-router'
import {
  ArrowUpDown,
  BookOpen,
  ChevronLeft,
  Columns3,
  Layers,
  Plus,
  Search,
  SlidersHorizontal,
} from 'lucide-react'

import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import {
  DropdownMenu,
  DropdownMenuCheckboxItem,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuRadioGroup,
  DropdownMenuRadioItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu'
import { cn } from '@/lib/utils'
import { PRIORITIES, SORT_OPTIONS } from '@/lib/sort'

import type { LucideIcon } from 'lucide-react'
import type { SortKey } from '@/lib/sort'
import type { Bead } from '@/lib/types'

export type BoardView = 'status' | 'epic'
export type ProjectTab = 'board' | 'knowledge'

interface BoardHeaderProps {
  project: string
  beads: Bead[]
  tab: ProjectTab
  setTab: (value: ProjectTab) => void
  search: string
  setSearch: (value: string) => void
  view: BoardView
  setView: (value: BoardView) => void
  priorities: number[]
  setPriorities: (value: number[]) => void
  sort: SortKey
  setSort: (value: SortKey) => void
  onCreate: () => void
  canWrite?: boolean
}

const VIEWS: { key: BoardView; label: string; icon: LucideIcon }[] = [
  { key: 'status', label: 'Status', icon: Columns3 },
  { key: 'epic', label: 'Epics', icon: Layers },
]

const TABS: { key: ProjectTab; label: string; icon: LucideIcon }[] = [
  { key: 'board', label: 'Board', icon: Columns3 },
  { key: 'knowledge', label: 'Knowledge', icon: BookOpen },
]

const PRIORITY_HINT: Record<number, string> = {
  0: 'highest',
  4: 'lowest',
}

export function BoardHeader({
  project,
  beads,
  tab,
  setTab,
  search,
  setSearch,
  view,
  setView,
  priorities,
  setPriorities,
  sort,
  setSort,
  onCreate,
  canWrite = true,
}: BoardHeaderProps) {
  function togglePriority(p: number, checked: boolean) {
    setPriorities(
      checked
        ? [...priorities, p].sort((a, b) => a - b)
        : priorities.filter((x) => x !== p),
    )
  }

  return (
    <header className="flex flex-col gap-3 pb-4">
      <div className="flex flex-wrap items-center gap-x-3 gap-y-2">
        <Link
          to="/"
          className="inline-flex items-center gap-1 rounded-md text-sm text-muted-foreground outline-none transition-colors hover:text-foreground focus-visible:ring-2 focus-visible:ring-ring/60"
        >
          <ChevronLeft className="size-4" aria-hidden="true" />
          Projects
        </Link>

        <span className="text-muted-foreground/40" aria-hidden="true">
          /
        </span>

        <div className="flex items-center gap-2">
          <h1 className="text-base font-medium tracking-tight text-foreground">
            {project}
          </h1>
          <span className="rounded-md bg-muted px-1.5 py-0.5 font-mono text-[0.7rem] leading-none text-muted-foreground tabular-nums">
            {beads.length}
          </span>
        </div>

        <div
          className="inline-flex shrink-0 items-center gap-0.5 rounded-md bg-muted/60 p-0.5"
          role="tablist"
          aria-label="Project view"
        >
          {TABS.map((item) => {
            const Icon = item.icon
            const active = tab === item.key
            return (
              <button
                key={item.key}
                type="button"
                role="tab"
                aria-selected={active}
                onClick={() => setTab(item.key)}
                className={cn(
                  'inline-flex h-7 cursor-pointer items-center gap-1.5 rounded px-2.5 text-xs font-medium transition-colors outline-none focus-visible:ring-2 focus-visible:ring-ring/60',
                  active
                    ? 'bg-background text-foreground ring-1 ring-foreground/10 shadow-sm'
                    : 'text-muted-foreground hover:text-foreground',
                )}
              >
                <Icon className="size-3.5" aria-hidden="true" />
                {item.label}
              </button>
            )
          })}
        </div>

        {tab === 'board' ? (
          <div className="ml-auto flex flex-wrap items-center gap-2">
            <div
              className="inline-flex items-center gap-0.5 rounded-md bg-muted/60 p-0.5"
              role="group"
              aria-label="Group by"
            >
              {VIEWS.map((v) => {
                const Icon = v.icon
                const active = view === v.key
                return (
                  <button
                    key={v.key}
                    type="button"
                    onClick={() => setView(v.key)}
                    aria-pressed={active}
                    className={cn(
                      'inline-flex items-center gap-1.5 rounded px-2 py-1 text-xs font-medium transition-colors outline-none focus-visible:ring-2 focus-visible:ring-ring/60',
                      active
                        ? 'bg-background text-foreground ring-1 ring-foreground/10 shadow-sm'
                        : 'text-muted-foreground hover:text-foreground',
                    )}
                  >
                    <Icon className="size-3.5" aria-hidden="true" />
                    {v.label}
                  </button>
                )
              })}
            </div>

            <DropdownMenu>
              <DropdownMenuTrigger asChild>
                <Button variant="outline" size="sm" className="h-8 gap-1.5">
                  <SlidersHorizontal className="size-3.5" aria-hidden="true" />
                  Priority
                  {priorities.length > 0 ? (
                    <span className="rounded bg-primary/15 px-1 text-[0.65rem] font-semibold tabular-nums text-primary">
                      {priorities.length}
                    </span>
                  ) : null}
                </Button>
              </DropdownMenuTrigger>
              <DropdownMenuContent align="end" className="w-44">
                <DropdownMenuLabel>Priority</DropdownMenuLabel>
                <DropdownMenuSeparator />
                {PRIORITIES.map((p) => (
                  <DropdownMenuCheckboxItem
                    key={p}
                    checked={priorities.includes(p)}
                    onCheckedChange={(checked) =>
                      togglePriority(p, Boolean(checked))
                    }
                    onSelect={(e) => e.preventDefault()}
                  >
                    <span className="font-mono font-medium">P{p}</span>
                    {PRIORITY_HINT[p] ? (
                      <span className="ml-1 text-xs text-muted-foreground">
                        · {PRIORITY_HINT[p]}
                      </span>
                    ) : null}
                  </DropdownMenuCheckboxItem>
                ))}
                {priorities.length > 0 ? (
                  <>
                    <DropdownMenuSeparator />
                    <DropdownMenuItem onSelect={() => setPriorities([])}>
                      Clear filter
                    </DropdownMenuItem>
                  </>
                ) : null}
              </DropdownMenuContent>
            </DropdownMenu>

            <DropdownMenu>
              <DropdownMenuTrigger asChild>
                <Button variant="outline" size="sm" className="h-8 gap-1.5">
                  <ArrowUpDown className="size-3.5" aria-hidden="true" />
                  {SORT_OPTIONS.find((o) => o.key === sort)?.label}
                </Button>
              </DropdownMenuTrigger>
              <DropdownMenuContent align="end" className="w-44">
                <DropdownMenuLabel>Sort by</DropdownMenuLabel>
                <DropdownMenuSeparator />
                <DropdownMenuRadioGroup
                  value={sort}
                  onValueChange={(v) => setSort(v as SortKey)}
                >
                  {SORT_OPTIONS.map((o) => (
                    <DropdownMenuRadioItem key={o.key} value={o.key}>
                      {o.label}
                    </DropdownMenuRadioItem>
                  ))}
                </DropdownMenuRadioGroup>
              </DropdownMenuContent>
            </DropdownMenu>

            <div className="relative">
              <Search
                className="pointer-events-none absolute top-1/2 left-2.5 size-3.5 -translate-y-1/2 text-muted-foreground"
                aria-hidden="true"
              />
              <Input
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                placeholder="Search..."
                className="h-8 w-40 pl-8 sm:w-52"
                aria-label="Search beads"
              />
            </div>

            {canWrite ? (
              <Button size="sm" onClick={onCreate}>
                <Plus aria-hidden="true" />
                New bead
              </Button>
            ) : null}
          </div>
        ) : null}
      </div>
    </header>
  )
}
