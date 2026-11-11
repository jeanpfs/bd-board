import { useState } from 'react'
import type { KeyboardEvent } from 'react'
import { X } from 'lucide-react'

import { Button } from '@/components/ui/button'
import { InteractiveRow } from '@/components/ui/interactive-row'
import { Kbd } from '@/components/ui/kbd'
import { suggestLabels } from '@/lib/labels'
import type { LabelCount } from '@/lib/labels'
import { cn } from '@/lib/utils'

interface LabelsInputProps {
  id?: string
  value: string[]
  onChange: (labels: string[]) => void
  counts: LabelCount[]
}

type Option =
  | { kind: 'create'; label: string }
  | { kind: 'match'; label: string; count: number }

export function LabelsInput({ id, value, onChange, counts }: LabelsInputProps) {
  const [text, setText] = useState('')
  const [focused, setFocused] = useState(false)
  const [highlight, setHighlight] = useState(0)

  const suggestions = suggestLabels(text, counts, value)
  const options: Option[] = [
    ...(suggestions.create
      ? [{ kind: 'create' as const, label: suggestions.create }]
      : []),
    ...suggestions.matches.map((m) => ({
      kind: 'match' as const,
      label: m.label,
      count: m.count,
    })),
  ]
  const listOpen = focused && options.length > 0
  const activeIndex = Math.min(highlight, options.length - 1)
  const prefix = id ?? 'labels'

  function add(label: string) {
    if (!value.includes(label)) onChange([...value, label])
    setText('')
    setHighlight(0)
  }

  function onKeyDown(event: KeyboardEvent<HTMLInputElement>) {
    if (event.key === 'Enter') {
      event.preventDefault()
      if (options.length > 0) add(options[activeIndex].label)
    } else if (event.key === 'ArrowDown' && options.length > 0) {
      event.preventDefault()
      setHighlight((activeIndex + 1) % options.length)
    } else if (event.key === 'ArrowUp' && options.length > 0) {
      event.preventDefault()
      setHighlight((activeIndex - 1 + options.length) % options.length)
    } else if (event.key === 'Backspace' && text === '' && value.length > 0) {
      onChange(value.slice(0, -1))
    }
  }

  return (
    <div className="relative">
      <div
        className={cn(
          'flex min-h-8 flex-wrap items-center gap-1.5 rounded-lg border border-input bg-transparent px-1.5 py-1 transition-colors',
          focused && 'border-ring ring-3 ring-ring/50',
        )}
        onClick={(event) => {
          if (event.target === event.currentTarget)
            event.currentTarget.querySelector('input')?.focus()
        }}
      >
        {value.map((label) => (
          <span
            key={label}
            className="inline-flex max-w-full items-center gap-0.5 rounded-[4px] py-0.5 pr-0.5 pl-1.5 text-xs text-foreground ring-1 ring-inset ring-border-strong"
          >
            <span className="truncate">{label}</span>
            <Button
              type="button"
              variant="ghost"
              size="icon-xs"
              aria-label={`Remove label ${label}`}
              onClick={() => onChange(value.filter((v) => v !== label))}
            >
              <X aria-hidden="true" />
            </Button>
          </span>
        ))}
        <input
          id={id}
          value={text}
          onChange={(event) => {
            setText(event.target.value)
            setHighlight(0)
          }}
          onFocus={() => setFocused(true)}
          onBlur={() => setFocused(false)}
          onKeyDown={onKeyDown}
          role="combobox"
          aria-expanded={listOpen}
          aria-controls={listOpen ? `${prefix}-options` : undefined}
          aria-autocomplete="list"
          aria-activedescendant={
            listOpen ? `${prefix}-option-${activeIndex}` : undefined
          }
          autoComplete="off"
          placeholder={value.length === 0 ? 'Add a label' : undefined}
          className="h-6 min-w-24 flex-1 bg-transparent text-sm outline-none placeholder:text-muted-foreground"
        />
      </div>

      {listOpen ? (
        <div
          id={`${prefix}-options`}
          role="listbox"
          className="absolute inset-x-0 top-full z-50 mt-1 flex flex-col gap-0.5 rounded-lg bg-popover p-1 text-popover-foreground shadow-md ring-1 ring-foreground/10"
        >
          {options.map((option, index) => (
            <InteractiveRow
              key={`${option.kind}-${option.label}`}
              id={`${prefix}-option-${index}`}
              role="option"
              aria-selected={index === activeIndex}
              variant="plain"
              size="compact"
              active={index === activeIndex}
              className="justify-between rounded-md py-1.5 text-sm"
              onMouseDown={(event) => event.preventDefault()}
              onMouseEnter={() => setHighlight(index)}
              onClick={() => add(option.label)}
            >
              {option.kind === 'create' ? (
                <>
                  <span className="truncate">
                    Create label{' '}
                    <span className="font-mono">“{option.label}”</span>
                  </span>
                  <span className="shrink-0 text-xs text-muted-foreground">
                    new
                  </span>
                </>
              ) : (
                <>
                  <span className="truncate">{option.label}</span>
                  <span className="shrink-0 text-xs text-muted-foreground">
                    {option.count === 1 ? '1 bead' : `${option.count} beads`}
                  </span>
                </>
              )}
            </InteractiveRow>
          ))}
          <div className="flex flex-wrap items-center gap-x-3 gap-y-1 border-t border-border px-2 pt-1.5 pb-1 text-xs text-muted-foreground">
            <span className="inline-flex items-center gap-1.5">
              <Kbd>Enter</Kbd> add
            </span>
            <span className="inline-flex items-center gap-1.5">
              <Kbd>Up Down</Kbd> move
            </span>
            <span className="inline-flex items-center gap-1.5">
              <Kbd>Backspace</Kbd> remove last
            </span>
          </div>
        </div>
      ) : null}
    </div>
  )
}
