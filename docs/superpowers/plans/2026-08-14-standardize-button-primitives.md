# Standardize Button Primitives Implementation Plan

> **For agentic workers:** REQUIRED: Use superpowers:subagent-driven-development (if subagents available) or superpowers:executing-plans to implement this plan. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Eliminate the 16 raw `<button>` elements scattered outside `src/components/ui/` so every clickable control in bd-board inherits the shadcn design system's hover/focus/disabled states, and add an ESLint guardrail so a raw `<button>` outside `ui/` can never silently reappear.

**Architecture:** The project already has a full shadcn/ui setup (`components.json`, `cva`-based primitives in `src/components/ui/`) — this is not a "migrate to shadcn" task, it's closing a drift gap. Three new/extended primitives absorb the 5 recurring shapes found across the 16 call sites: `Button` (existing, reused for icon-affordances and text-links), `Badge` (extended, reused for removable filter chips and colored nav pills), a new `InteractiveRow` (for clickable card-shaped rows), and a new `ToggleGroup`/`Toggle` pair (for the one segmented view-switcher). An ESLint `no-restricted-syntax` rule then bans `<button>` outside `src/components/ui/**`.

**Tech Stack:** React 19, Tailwind CSS 4, `class-variance-authority`, `radix-ui` (unified package, already bundled — no new dependency), ESLint flat config (`@tanstack/eslint-config`).

---

## Chunk 1: New and extended primitives

### Task 1: ESLint guardrail (written first, expected to fail against the 16 existing call sites)

**Files:**

- Modify: `eslint.config.js`

- [ ] **Step 1: Add the `no-restricted-syntax` rule scoped to `src/**/\*.tsx`, with an override that turns it off inside `src/components/ui/**`**

Edit `eslint.config.js` to add two new blocks (keep the existing ones untouched):

```js
//  @ts-check

import { tanstackConfig } from '@tanstack/eslint-config'

export default [
  ...tanstackConfig,
  {
    rules: {
      'import/no-cycle': 'off',
      'import/order': 'off',
      'sort-imports': 'off',
      '@typescript-eslint/array-type': 'off',
      '@typescript-eslint/require-await': 'off',
      'pnpm/json-enforce-catalog': 'off',
    },
  },
  {
    files: ['src/**/*.tsx'],
    rules: {
      'no-restricted-syntax': [
        'error',
        {
          selector: "JSXOpeningElement[name.name='button']",
          message:
            'Raw <button> is not allowed outside src/components/ui/. Use <Button>, <Badge>, or <InteractiveRow> from @/components/ui instead.',
        },
      ],
    },
  },
  {
    files: ['src/components/ui/**/*.tsx'],
    rules: {
      'no-restricted-syntax': 'off',
    },
  },
  {
    ignores: [
      '.agents/**',
      '.beads/**',
      '.claude/**',
      '.codex/**',
      '.output/**',
      'dist/**',
      'dist-ssr/**',
      'docs/design/**',
      'eslint.config.js',
      'node_modules/**',
      'prettier.config.js',
      'src/routeTree.gen.ts',
    ],
  },
]
```

- [ ] **Step 2: Run lint and confirm it fails on the 16 existing raw `<button>` call sites (RED)**

Run: `pnpm exec eslint src/components/board-header.tsx src/components/board-swimlanes.tsx src/components/bead-card.tsx src/components/knowledge-detail-modal.tsx src/components/bead-detail-modal.tsx src/components/project-rail.tsx src/components/project-knowledge-panel.tsx`

Expected: 16 errors, one per `<button` occurrence, message `Raw <button> is not allowed outside src/components/ui/...`.

Do not fix these yet — they are fixed file-by-file in Chunk 2. This step only proves the rule works before anything is migrated.

- [ ] **Step 3: Commit the guardrail on its own**

```bash
git add eslint.config.js
git commit -m "chore: ban raw <button> outside src/components/ui/"
```

---

### Task 2: `InteractiveRow` primitive

**Files:**

- Create: `src/components/ui/interactive-row.tsx`

Covers the "card-shaped clickable row" pattern duplicated across `knowledge-detail-modal.tsx` (`KRow`, source-bead row), `bead-detail-modal.tsx` (`LinkedBeadList` row, knowledge row), and the two "content-wrapper, no surface of its own" buttons in `bead-card.tsx` and `project-knowledge-panel.tsx` (their surface/hover already lives on an ancestor element).

- [ ] **Step 1: Create the file**

```tsx
import * as React from 'react'
import { cva } from 'class-variance-authority'
import type { VariantProps } from 'class-variance-authority'

import { cn } from '@/lib/utils'

const interactiveRowVariants = cva(
  'block w-full text-left outline-none transition-colors focus-visible:ring-2 focus-visible:ring-ring/60 disabled:cursor-default',
  {
    variants: {
      variant: {
        surface:
          'bg-card ring-1 ring-inset ring-border hover:bg-card-hover hover:ring-ring/40 disabled:hover:bg-card disabled:hover:ring-border',
        plain: '',
      },
      size: {
        compact: 'flex items-center gap-2.5 rounded-[8px] px-[10px] py-2',
        cozy: 'flex gap-[11px] rounded-[9px] px-3 py-2.5',
        flush: '',
      },
    },
    defaultVariants: {
      variant: 'surface',
      size: 'compact',
    },
  },
)

interface InteractiveRowProps
  extends
    React.ComponentProps<'button'>,
    VariantProps<typeof interactiveRowVariants> {
  active?: boolean
}

function InteractiveRow({
  className,
  variant,
  size,
  active = false,
  ...props
}: InteractiveRowProps) {
  return (
    <button
      type="button"
      data-slot="interactive-row"
      data-active={active || undefined}
      className={cn(
        interactiveRowVariants({ variant, size }),
        active && 'ring-ring/45 hover:bg-card hover:ring-ring/45',
        className,
      )}
      {...props}
    />
  )
}

export { InteractiveRow, interactiveRowVariants }
```

- [ ] **Step 2: Typecheck**

Run: `pnpm typecheck`
Expected: no new errors from this file (it isn't imported anywhere yet).

- [ ] **Step 3: Commit**

```bash
git add src/components/ui/interactive-row.tsx
git commit -m "feat: add InteractiveRow primitive for clickable card rows"
```

---

### Task 3: Extend `Badge` — `filter` variant, `onRemove`, clickable

**Files:**

- Modify: `src/components/ui/badge.tsx`

Covers two shapes: the removable filter chip (`board-header.tsx` "Ready ×" / assignee ×) and the colored knowledge-type nav pill (`knowledge-detail-modal.tsx:464`), which is a `Badge` that needs to be clickable without going through `asChild`.

- [ ] **Step 1: Add the `filter` variant, an `onRemove` prop, and make `Badge` render as a real `<button>` when `onClick` is passed**

```tsx
import * as React from 'react'
import { cva } from 'class-variance-authority'
import type { VariantProps } from 'class-variance-authority'
import { Slot } from 'radix-ui'
import { X } from 'lucide-react'

import { cn } from '@/lib/utils'

const badgeVariants = cva(
  'group/badge inline-flex h-5 w-fit shrink-0 items-center justify-center gap-1 overflow-hidden rounded-4xl border border-transparent px-2 py-0.5 text-xs font-medium whitespace-nowrap transition-all focus-visible:border-ring focus-visible:ring-[3px] focus-visible:ring-ring/50 has-data-[icon=inline-end]:pr-1.5 has-data-[icon=inline-start]:pl-1.5 aria-invalid:border-destructive aria-invalid:ring-destructive/20 dark:aria-invalid:ring-destructive/40 [&>svg]:pointer-events-none [&>svg]:size-3!',
  {
    variants: {
      variant: {
        default:
          'bg-primary text-primary-foreground [a]:hover:bg-primary-hover',
        secondary:
          'bg-secondary text-secondary-foreground [a]:hover:bg-secondary/80',
        destructive:
          'bg-destructive/10 text-destructive focus-visible:ring-destructive/20 dark:bg-destructive/20 dark:focus-visible:ring-destructive/40 [a]:hover:bg-destructive/20',
        outline:
          'border-border text-foreground [a]:hover:bg-muted [a]:hover:text-muted-foreground',
        ghost:
          'hover:bg-muted hover:text-muted-foreground dark:hover:bg-muted/50',
        link: 'text-primary-text underline-offset-4 hover:underline',
        filter:
          'h-6 gap-1 rounded-full bg-primary/26 px-2 text-xs font-medium text-primary-text ring-1 ring-inset ring-ring/55 transition-colors hover:bg-primary/35',
      },
    },
    defaultVariants: {
      variant: 'default',
    },
  },
)

interface BadgeProps
  extends React.ComponentProps<'span'>, VariantProps<typeof badgeVariants> {
  asChild?: boolean
  onClick?: React.MouseEventHandler
  onRemove?: () => void
}

function Badge({
  className,
  variant = 'default',
  asChild = false,
  onClick,
  onRemove,
  children,
  ...props
}: BadgeProps) {
  const Comp = asChild ? Slot.Root : onClick ? 'button' : 'span'

  return (
    <Comp
      data-slot="badge"
      data-variant={variant}
      type={Comp === 'button' ? 'button' : undefined}
      onClick={onClick}
      className={cn(badgeVariants({ variant }), className)}
      {...props}
    >
      {children}
      {onRemove ? (
        <button
          type="button"
          onClick={onRemove}
          aria-label="Remove"
          className="-mr-0.5 ml-0.5 rounded-full p-0.5 hover:bg-black/15"
        >
          <X className="size-3" aria-hidden="true" />
        </button>
      ) : null}
    </Comp>
  )
}

export { Badge, badgeVariants }
```

Note: the inner `onRemove` `<button>` stays raw because this file is inside `src/components/ui/`, which the ESLint override from Task 1 exempts.

- [ ] **Step 2: Typecheck**

Run: `pnpm typecheck`
Expected: no new errors. (`react-markdown`'s `ComponentProps<'span'>` already excludes `onClick`? — verify: since we widened via `BadgeProps` explicitly declaring `onClick`, this should typecheck; if TS complains about the `Comp` union type accepting `type`, cast `Comp` as `React.ElementType` — add `const Comp: React.ElementType = ...` if the plain union causes a JSX generic error.)

- [ ] **Step 3: Commit**

```bash
git add src/components/ui/badge.tsx
git commit -m "feat: add filter variant, onRemove, and clickable mode to Badge"
```

---

### Task 4: `Toggle` and `ToggleGroup` primitives

**Files:**

- Create: `src/components/ui/toggle.tsx`
- Create: `src/components/ui/toggle-group.tsx`

`radix-ui` (already a dependency) re-exports `Toggle` and `ToggleGroup` from `@radix-ui/react-toggle` / `@radix-ui/react-toggle-group` — confirmed via `node_modules/radix-ui/dist/index.d.mts`. No new dependency needed. Modeled on the existing `src/components/ui/tabs.tsx` wrapper convention (`'use client'`, `cva`, `cn`, `data-slot`).

- [ ] **Step 1: Create `toggle.tsx`**

```tsx
'use client'

import * as React from 'react'
import { cva } from 'class-variance-authority'
import type { VariantProps } from 'class-variance-authority'
import { Toggle as TogglePrimitive } from 'radix-ui'

import { cn } from '@/lib/utils'

const toggleVariants = cva(
  "inline-flex items-center gap-1.5 rounded px-2 py-1 text-xs font-medium whitespace-nowrap text-muted-foreground outline-none transition-colors hover:text-foreground focus-visible:ring-2 focus-visible:ring-ring/60 disabled:pointer-events-none disabled:opacity-50 data-[state=on]:bg-background data-[state=on]:text-foreground data-[state=on]:shadow-sm data-[state=on]:ring-1 data-[state=on]:ring-foreground/10 [&_svg]:pointer-events-none [&_svg]:shrink-0 [&_svg:not([class*='size-'])]:size-3.5",
)

function Toggle({
  className,
  ...props
}: React.ComponentProps<typeof TogglePrimitive.Root> &
  VariantProps<typeof toggleVariants>) {
  return (
    <TogglePrimitive.Root
      data-slot="toggle"
      className={cn(toggleVariants(), className)}
      {...props}
    />
  )
}

export { Toggle, toggleVariants }
```

- [ ] **Step 2: Create `toggle-group.tsx`**

```tsx
'use client'

import * as React from 'react'
import { ToggleGroup as ToggleGroupPrimitive } from 'radix-ui'

import { cn } from '@/lib/utils'
import { toggleVariants } from '@/components/ui/toggle'

function ToggleGroup({
  className,
  ...props
}: React.ComponentProps<typeof ToggleGroupPrimitive.Root>) {
  return (
    <ToggleGroupPrimitive.Root
      data-slot="toggle-group"
      className={cn(
        'inline-flex items-center gap-0.5 rounded-md bg-muted/60 p-0.5',
        className,
      )}
      {...props}
    />
  )
}

function ToggleGroupItem({
  className,
  ...props
}: React.ComponentProps<typeof ToggleGroupPrimitive.Item>) {
  return (
    <ToggleGroupPrimitive.Item
      data-slot="toggle-group-item"
      className={cn(toggleVariants(), className)}
      {...props}
    />
  )
}

export { ToggleGroup, ToggleGroupItem }
```

- [ ] **Step 3: Typecheck**

Run: `pnpm typecheck`
Expected: no new errors.

- [ ] **Step 4: Commit**

```bash
git add src/components/ui/toggle.tsx src/components/ui/toggle-group.tsx
git commit -m "feat: add Toggle and ToggleGroup primitives"
```

---

## Chunk 2: Migrate the 16 call sites

Each task below fixes one file. After each task, re-run the scoped lint command from Task 1 Step 2 restricted to that file — it should go from N errors to 0 for that file.

### Task 5: `board-header.tsx` (3 call sites: view toggle, Ready chip, assignee chip)

**Files:**

- Modify: `src/components/board-header.tsx`

- [ ] **Step 1: Replace the view-toggle `<button>` (lines 86–112) with `ToggleGroup`/`ToggleGroupItem`**

Replace:

```tsx
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
```

With:

```tsx
<ToggleGroup
  type="single"
  value={view}
  onValueChange={(value) => value && setView(value as BoardView)}
  aria-label="Group by"
>
  {VIEWS.map((v) => {
    const Icon = v.icon
    return (
      <ToggleGroupItem key={v.key} value={v.key} aria-label={v.label}>
        <Icon className="size-3.5" aria-hidden="true" />
        {v.label}
      </ToggleGroupItem>
    )
  })}
</ToggleGroup>
```

- [ ] **Step 2: Replace the Ready chip (lines 114–123) and assignee chip (lines 125–134)**

Replace:

```tsx
{
  ready ? (
    <button
      type="button"
      onClick={() => setReady(false)}
      className="inline-flex h-6 items-center gap-1 rounded-full bg-primary/26 px-2 text-xs font-medium text-primary-text ring-1 ring-inset ring-ring/55 transition-colors hover:bg-primary/35"
    >
      Ready
      <X className="size-3" aria-hidden="true" />
    </button>
  ) : null
}

{
  assignee ? (
    <button
      type="button"
      onClick={() => setAssignee('')}
      className="inline-flex h-6 max-w-48 items-center gap-1 rounded-full bg-primary/26 px-2 text-xs font-medium text-primary-text ring-1 ring-inset ring-ring/55 transition-colors hover:bg-primary/35"
    >
      <span className="truncate">{assignee}</span>
      <X className="size-3 shrink-0" aria-hidden="true" />
    </button>
  ) : null
}
```

With:

```tsx
{
  ready ? (
    <Badge variant="filter" onRemove={() => setReady(false)}>
      Ready
    </Badge>
  ) : null
}

{
  assignee ? (
    <Badge
      variant="filter"
      className="max-w-48"
      onRemove={() => setAssignee('')}
    >
      <span className="truncate">{assignee}</span>
    </Badge>
  ) : null
}
```

- [ ] **Step 3: Update imports**

Remove the now-unused `X` import if nothing else in the file uses it (check remaining usages first — `X` was only used by the two chips, so remove it from the `lucide-react` import). Add:

```tsx
import { Badge } from '@/components/ui/badge'
import { ToggleGroup, ToggleGroupItem } from '@/components/ui/toggle-group'
```

Remove `cn` from imports if it becomes unused after this edit (check other usages in the file first — it is not used elsewhere in `board-header.tsx`, so remove `import { cn } from '@/lib/utils'`).

- [ ] **Step 4: Verify**

Run: `pnpm typecheck && pnpm exec eslint src/components/board-header.tsx`
Expected: both pass with zero errors.

- [ ] **Step 5: Commit**

```bash
git add src/components/board-header.tsx
git commit -m "refactor: migrate board-header controls to design system primitives"
```

---

### Task 6: `board-swimlanes.tsx` (2 call sites: expand/collapse, epic link)

**Files:**

- Modify: `src/components/board-swimlanes.tsx`

- [ ] **Step 1: Replace the expand/collapse button (lines 172–184) with `<Button variant="ghost" size="icon-xs">`**

Replace:

```tsx
<button
  type="button"
  onClick={() => setOpen((v) => !v)}
  aria-expanded={open}
  aria-label={open ? 'Recolher faixa' : 'Expandir faixa'}
  className="flex size-[22px] shrink-0 items-center justify-center rounded-[5px] text-muted-foreground transition-colors hover:bg-white/8 hover:text-foreground focus-visible:ring-2 focus-visible:ring-ring/60 focus-visible:outline-none"
>
  {open ? (
    <ChevronDown className="size-4" aria-hidden="true" />
  ) : (
    <ChevronRight className="size-4" aria-hidden="true" />
  )}
</button>
```

With:

```tsx
<Button
  variant="ghost"
  size="icon-xs"
  onClick={() => setOpen((v) => !v)}
  aria-expanded={open}
  aria-label={open ? 'Recolher faixa' : 'Expandir faixa'}
>
  {open ? (
    <ChevronDown className="size-4" aria-hidden="true" />
  ) : (
    <ChevronRight className="size-4" aria-hidden="true" />
  )}
</Button>
```

- [ ] **Step 2: Replace the epic link button (lines 187–202) with `<Button variant="link">`**

Replace:

```tsx
        {epic ? (
          <button
            type="button"
            onClick={() => onOpen(epic)}
            className="flex min-w-0 items-center gap-2 rounded text-left outline-none focus-visible:ring-2 focus-visible:ring-ring/60"
          >
            <Layers
              className="size-3.5 shrink-0 text-primary-text"
              aria-hidden="true"
            />
            <span className="font-mono text-[11px] text-muted-foreground">
              {epic.id}
            </span>
            <span className="truncate text-[13px] font-medium tracking-[-0.005em] text-foreground hover:text-primary-text">
              {epic.title}
            </span>
          </button>
        ) : (
```

With:

```tsx
        {epic ? (
          <Button
            variant="link"
            onClick={() => onOpen(epic)}
            className="h-auto min-w-0 gap-2 p-0"
          >
            <Layers
              className="size-3.5 shrink-0 text-primary-text"
              aria-hidden="true"
            />
            <span className="font-mono text-[11px] text-muted-foreground">
              {epic.id}
            </span>
            <span className="truncate text-[13px] font-medium tracking-[-0.005em] text-foreground">
              {epic.title}
            </span>
          </Button>
        ) : (
```

- [ ] **Step 3: Add the `Button` import**

```tsx
import { Button } from '@/components/ui/button'
```

- [ ] **Step 4: Verify**

Run: `pnpm typecheck && pnpm exec eslint src/components/board-swimlanes.tsx`
Expected: both pass with zero errors.

- [ ] **Step 5: Commit**

```bash
git add src/components/board-swimlanes.tsx
git commit -m "refactor: migrate board-swimlanes controls to design system primitives"
```

---

### Task 7: `bead-card.tsx` (2 call sites: drag handle, card body button)

**Files:**

- Modify: `src/components/bead-card.tsx`

- [ ] **Step 1: Replace the drag handle (lines 91–99) with `<Button variant="ghost" size="icon-xs">`, preserving dnd-kit props and the fade-in-on-card-hover behavior**

Replace:

```tsx
<button
  type="button"
  {...attributes}
  {...listeners}
  aria-label="Drag bead"
  className="absolute top-1.5 right-1.5 z-10 flex cursor-grab touch-none items-center rounded p-0.5 text-muted-foreground/30 opacity-0 transition-opacity group-hover/card:opacity-100 hover:text-muted-foreground active:cursor-grabbing"
>
  <GripVertical className="size-3.5" aria-hidden="true" />
</button>
```

With:

```tsx
<Button
  variant="ghost"
  size="icon-xs"
  {...attributes}
  {...listeners}
  aria-label="Drag bead"
  className="absolute top-1.5 right-1.5 z-10 size-auto cursor-grab touch-none p-0.5 text-muted-foreground/30 opacity-0 group-hover/card:opacity-100 hover:bg-transparent hover:text-muted-foreground active:cursor-grabbing"
>
  <GripVertical className="size-3.5" aria-hidden="true" />
</Button>
```

- [ ] **Step 2: Replace the card body button (lines 102–201) with `InteractiveRow`**

Replace the opening tag:

```tsx
      <button
        type="button"
        onClick={() => onOpen(bead)}
        className="flex w-full cursor-pointer flex-col gap-[7px] rounded-[8px] px-[10px] py-[9px] text-left outline-none focus-visible:ring-2 focus-visible:ring-ring/60"
      >
```

With:

```tsx
      <InteractiveRow
        variant="plain"
        size="flush"
        onClick={() => onOpen(bead)}
        className="flex cursor-pointer flex-col gap-[7px] rounded-[8px] px-[10px] py-[9px]"
      >
```

And the closing `</button>` on line 201 with `</InteractiveRow>`.

- [ ] **Step 3: Update imports**

```tsx
import { Button } from '@/components/ui/button'
import { InteractiveRow } from '@/components/ui/interactive-row'
```

- [ ] **Step 4: Verify**

Run: `pnpm typecheck && pnpm exec eslint src/components/bead-card.tsx`
Expected: both pass with zero errors.

- [ ] **Step 5: Commit**

```bash
git add src/components/bead-card.tsx
git commit -m "refactor: migrate bead-card controls to design system primitives"
```

---

### Task 8: `knowledge-detail-modal.tsx` (4 call sites: `KRow`, breadcrumb, source-bead row, type pills)

**Files:**

- Modify: `src/components/knowledge-detail-modal.tsx`

- [ ] **Step 1: Replace `KRow`'s button (lines 90–98) with `InteractiveRow`**

Replace:

```tsx
    <button
      type="button"
      onClick={onOpen}
      disabled={active}
      className={cn(
        'flex w-full gap-[11px] rounded-[9px] bg-card px-3 py-2.5 text-left ring-1 ring-inset ring-border transition-colors',
        active ? 'ring-ring/45' : 'hover:bg-card-hover hover:ring-ring/40',
      )}
    >
```

With:

```tsx
    <InteractiveRow
      size="cozy"
      onClick={onOpen}
      disabled={active}
      active={active}
    >
```

And the closing `</button>` with `</InteractiveRow>`.

- [ ] **Step 2: Replace the "Recorded on" breadcrumb button (lines 223–236) with `<Button variant="link">`**

Replace:

```tsx
                <button
                  type="button"
                  onClick={() => bead && onOpenBead(bead)}
                  disabled={!bead}
                  className="mt-2 inline-flex w-fit max-w-full items-center gap-1.5 text-xs text-muted-foreground transition-colors hover:text-primary-text disabled:hover:text-muted-foreground"
                >
```

With:

```tsx
                <Button
                  variant="link"
                  onClick={() => bead && onOpenBead(bead)}
                  disabled={!bead}
                  className="mt-2 h-auto w-fit max-w-full gap-1.5 p-0 text-xs text-muted-foreground"
                >
```

And the closing `</button>` with `</Button>`.

- [ ] **Step 3: Replace the source-bead row button (lines 275–301) with `InteractiveRow`**

Replace the opening tag:

```tsx
                      <button
                        type="button"
                        onClick={() => onOpenBead(bead)}
                        className="flex w-full items-center gap-2.5 rounded-[8px] bg-card px-[10px] py-2 text-left ring-1 ring-inset ring-border transition-colors hover:bg-card-hover hover:ring-ring/40"
                      >
```

With:

```tsx
                      <InteractiveRow onClick={() => onOpenBead(bead)}>
```

And the closing `</button>` with `</InteractiveRow>`.

- [ ] **Step 4: Replace the type-pill buttons (lines 464–486) with a clickable `Badge`**

Replace:

```tsx
<button
  key={t}
  type="button"
  disabled={!target || isCurrent}
  onClick={() => target && onOpenKnowledge(target)}
  title={`${KNOWLEDGE_TYPE_LABEL[t]} · ${typeCounts.get(t) ?? 0}`}
  className={cn(
    'inline-flex items-center gap-[5px] rounded-[4px] px-1.5 py-0.5 font-mono text-[10px] font-semibold tracking-[0.08em] uppercase',
    K_BG_CLASS[t],
    K_TEXT_CLASS[t],
    isCurrent && 'ring-1 ring-inset ring-current',
  )}
>
  <span
    className={cn('size-[5px] shrink-0 rounded-full', K_DOT_CLASS[t])}
    aria-hidden="true"
  />
  {KNOWLEDGE_TYPE_LABEL[t]} {typeCounts.get(t) ?? 0}
</button>
```

With:

```tsx
<Badge
  key={t}
  variant="outline"
  disabled={!target || isCurrent}
  onClick={() => target && onOpenKnowledge(target)}
  title={`${KNOWLEDGE_TYPE_LABEL[t]} · ${typeCounts.get(t) ?? 0}`}
  className={cn(
    'border-transparent font-mono text-[10px] tracking-[0.08em] uppercase disabled:pointer-events-none disabled:opacity-100',
    K_BG_CLASS[t],
    K_TEXT_CLASS[t],
    isCurrent && 'ring-1 ring-inset ring-current',
  )}
>
  <span
    className={cn('size-[5px] shrink-0 rounded-full', K_DOT_CLASS[t])}
    aria-hidden="true"
  />
  {KNOWLEDGE_TYPE_LABEL[t]} {typeCounts.get(t) ?? 0}
</Badge>
```

- [ ] **Step 5: Update imports**

```tsx
import { Badge } from '@/components/ui/badge'
import { InteractiveRow } from '@/components/ui/interactive-row'
```

- [ ] **Step 6: Verify**

Run: `pnpm typecheck && pnpm exec eslint src/components/knowledge-detail-modal.tsx`
Expected: both pass with zero errors.

- [ ] **Step 7: Commit**

```bash
git add src/components/knowledge-detail-modal.tsx
git commit -m "refactor: migrate knowledge-detail-modal controls to design system primitives"
```

---

### Task 9: `bead-detail-modal.tsx` (3 call sites: `LinkedBeadList` row, parent breadcrumb, knowledge row)

**Files:**

- Modify: `src/components/bead-detail-modal.tsx`

- [ ] **Step 1: Replace `LinkedBeadList`'s button (lines 147–195) with `InteractiveRow`**

Replace the opening tag:

```tsx
            <button
              type="button"
              disabled={!target}
              onClick={() => {
                if (target) onOpenBead(target)
              }}
              className="flex w-full items-center gap-2.5 rounded-[8px] bg-card px-[10px] py-2 text-left ring-1 ring-inset ring-border transition-colors hover:bg-card-hover hover:ring-ring/40 disabled:cursor-default disabled:hover:bg-card disabled:hover:ring-border"
            >
```

With:

```tsx
            <InteractiveRow
              disabled={!target}
              onClick={() => {
                if (target) onOpenBead(target)
              }}
            >
```

And the closing `</button>` with `</InteractiveRow>`.

- [ ] **Step 2: Replace the parent breadcrumb button (lines 860–872) with `<Button variant="link">`**

Replace:

```tsx
                    <button
                      type="button"
                      onClick={() => onOpenBead(parentBead)}
                      className="mt-2 inline-flex w-fit max-w-full items-center gap-1.5 rounded text-xs text-muted-foreground transition-colors hover:text-primary-text"
                    >
```

With:

```tsx
                    <Button
                      variant="link"
                      onClick={() => onOpenBead(parentBead)}
                      className="mt-2 h-auto w-fit max-w-full gap-1.5 p-0 text-xs text-muted-foreground"
                    >
```

And the closing `</button>` with `</Button>`.

- [ ] **Step 3: Replace the knowledge row button (lines 946–985) with `InteractiveRow`**

Replace the opening tag:

```tsx
                            <button
                              key={entry.id}
                              type="button"
                              onClick={() => onOpenKnowledge(entry.id)}
                              className="flex gap-[11px] rounded-[9px] bg-card px-3 py-2.5 text-left ring-1 ring-inset ring-border transition-colors hover:bg-card-hover hover:ring-ring/40"
                            >
```

With:

```tsx
                            <InteractiveRow
                              key={entry.id}
                              size="cozy"
                              onClick={() => onOpenKnowledge(entry.id)}
                            >
```

And the closing `</button>` with `</InteractiveRow>`.

- [ ] **Step 4: Add the `InteractiveRow` import** (`Button` is already imported in this file)

```tsx
import { InteractiveRow } from '@/components/ui/interactive-row'
```

- [ ] **Step 5: Verify**

Run: `pnpm typecheck && pnpm exec eslint src/components/bead-detail-modal.tsx`
Expected: both pass with zero errors.

- [ ] **Step 6: Commit**

```bash
git add src/components/bead-detail-modal.tsx
git commit -m "refactor: migrate bead-detail-modal controls to design system primitives"
```

---

### Task 10: `project-rail.tsx` (1 call site: "forget identity" button)

**Files:**

- Modify: `src/components/project-rail.tsx`

- [ ] **Step 1: Replace the button (lines 221–229) with `<Button variant="ghost" size="icon-xs">`**

Replace:

```tsx
<button
  type="button"
  onClick={() => chooseIdentity('')}
  aria-label="Forget who I am"
  title={`Signed in as ${identity}`}
  className="flex size-5 shrink-0 items-center justify-center rounded text-faint opacity-0 transition-opacity hover:text-foreground focus-visible:opacity-100 focus-visible:ring-2 focus-visible:ring-ring/60 focus-visible:outline-none group-hover/mine:opacity-100"
>
  <X className="size-3" aria-hidden="true" />
</button>
```

With:

```tsx
<Button
  variant="ghost"
  size="icon-xs"
  onClick={() => chooseIdentity('')}
  aria-label="Forget who I am"
  title={`Signed in as ${identity}`}
  className="size-5 shrink-0 text-faint opacity-0 hover:bg-transparent hover:text-foreground focus-visible:opacity-100 group-hover/mine:opacity-100"
>
  <X className="size-3" aria-hidden="true" />
</Button>
```

- [ ] **Step 2: Add the `Button` import**

```tsx
import { Button } from '@/components/ui/button'
```

- [ ] **Step 3: Verify**

Run: `pnpm typecheck && pnpm exec eslint src/components/project-rail.tsx`
Expected: both pass with zero errors.

- [ ] **Step 4: Commit**

```bash
git add src/components/project-rail.tsx
git commit -m "refactor: migrate project-rail identity control to design system primitives"
```

---

### Task 11: `project-knowledge-panel.tsx` (1 call site: knowledge entry content wrapper — this is one of the two buttons found with zero hover feedback)

**Files:**

- Modify: `src/components/project-knowledge-panel.tsx`

- [ ] **Step 1: Replace the button (lines 263–266, closing at line 286) with `InteractiveRow`**

Replace the opening tag:

```tsx
                        <button
                          type="button"
                          onClick={() => onOpenKnowledge(entry.id)}
                          className="min-w-0 flex-1 text-left"
                        >
```

With:

```tsx
                        <InteractiveRow
                          variant="plain"
                          size="flush"
                          onClick={() => onOpenKnowledge(entry.id)}
                          className="min-w-0 flex-1 rounded-[6px]"
                        >
```

And the closing `</button>` (line 286) with `</InteractiveRow>`.

- [ ] **Step 2: Add the `InteractiveRow` import**

```tsx
import { InteractiveRow } from '@/components/ui/interactive-row'
```

- [ ] **Step 3: Verify**

Run: `pnpm typecheck && pnpm exec eslint src/components/project-knowledge-panel.tsx`
Expected: both pass with zero errors.

- [ ] **Step 4: Commit**

```bash
git add src/components/project-knowledge-panel.tsx
git commit -m "refactor: migrate project-knowledge-panel entry control to design system primitives"
```

---

## Chunk 3: Full verification

### Task 12: Repo-wide checks and Browser QA

**Files:** none (verification only)

- [ ] **Step 1: Full lint pass (guardrail must be green everywhere now)**

Run: `pnpm exec eslint --max-warnings=0`
Expected: 0 errors, 0 warnings — confirms all 16 original violations are fixed and no new raw `<button>` was introduced.

- [ ] **Step 2: Full validation suite**

Run: `pnpm validate`
Expected: typecheck, format check, lint, existing test suite, and `pnpm audit:prod` all pass. (No new unit tests are added in this plan — these are presentational/style changes; no existing `ui/` component in this repo has a `.test.tsx`, so this follows established project convention. Verification is lint + typecheck + Browser QA below, per the project's "TDD does not fit exploratory UI/visual layout" guidance.)

- [ ] **Step 3: Browser QA — start the dev server**

Run: `pnpm dev` (background, port 3009)

- [ ] **Step 4: Browser QA — walk each of the 5 patterns and confirm hover/focus/disabled states render correctly**

Use `agent-browser` against `http://localhost:3009`, for a project that has beads and knowledge entries:

1. **Icon-affordance (`Button ghost icon-xs`):** hover the swimlane expand/collapse chevron, the bead-card drag handle (on card hover), and the sidebar "forget identity" × — confirm `bg-muted` hover ring and no layout shift.
2. **Text-link (`Button link`):** hover the epic name in a swimlane header, the "Recorded on" breadcrumb in a knowledge modal, and the parent-bead breadcrumb in a bead modal — confirm underline-on-hover now fires (this is the one intentional visual change from Q7).
3. **`InteractiveRow`:** open a bead detail modal with linked beads/knowledge and hover each row — confirm `bg-card-hover`/ring feedback; open a knowledge modal reached via `KRow` and confirm the currently-open entry shows the `active` ring instead of hover.
4. **`Badge filter`:** apply the Ready and Assignee quick filters from the sidebar, confirm the chips render with the × and that clicking × clears the filter.
5. **`ToggleGroup`:** click each of Epics/Priority/Status in the board header, confirm the active segment gets the `bg-background` pressed look and keyboard arrow-key navigation moves focus between segments (Radix roving tabindex).

Also specifically re-check the two zero-hover bugs found during audit: the epic name button in a swimlane header, and a knowledge entry row in the Knowledge tab — both must now show visible hover feedback.

- [ ] **Step 5: Report results**

Record: URL tested (`localhost:3009`), viewport used, the 5 flows above with pass/fail, and any deviation from the expected visual change noted in Step 4.2.

- [ ] **Step 6: Stop the dev server** if it was started for this QA pass and nothing else is using it.

---

## Notes for the executor

- `docs/design/bd-board-dark-system/` is intentionally untouched (see conversation decision) — it is a provenance snapshot of the original redesign, not a living implementation changelog.
- Branch: continue on `feature/dark-design-system` (current branch) — no new branch.
- If any migrated call site's visual output differs from the original beyond what this plan explicitly calls out as intentional (the two `variant="link"` underline changes), stop and flag it rather than silently accepting the diff — the goal is zero unintended visual regressions.
