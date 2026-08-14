import {
  ArrowUpDown,
  Columns3,
  Layers,
  Plus,
  Search,
  SlidersHorizontal,
  X,
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

export type BoardView = 'status' | 'epic'
export type ProjectTab = 'board' | 'knowledge'

interface BoardHeaderProps {
  search: string
  setSearch: (value: string) => void
  view: BoardView
  setView: (value: BoardView) => void
  priorities: number[]
  setPriorities: (value: number[]) => void
  ready: boolean
  setReady: (value: boolean) => void
  sort: SortKey
  setSort: (value: SortKey) => void
  onCreate: () => void
  canWrite?: boolean
}

const VIEWS: { key: BoardView; label: string; icon: LucideIcon }[] = [
  { key: 'status', label: 'Status', icon: Columns3 },
  { key: 'epic', label: 'Epics', icon: Layers },
]

const PRIORITY_HINT: Record<number, string> = {
  0: 'highest',
  4: 'lowest',
}

export function BoardHeader({
  search,
  setSearch,
  view,
  setView,
  priorities,
  setPriorities,
  ready,
  setReady,
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

        {ready ? (
          <button
            type="button"
            onClick={() => setReady(false)}
            className="inline-flex h-6 items-center gap-1 rounded-full bg-primary/26 px-2 text-xs font-medium text-primary-text ring-1 ring-inset ring-ring/55 transition-colors hover:bg-primary/35"
          >
            Ready
            <X className="size-3" aria-hidden="true" />
          </button>
        ) : null}

        <div className="ml-auto flex flex-wrap items-center gap-2">
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
      </div>
    </header>
  )
}
