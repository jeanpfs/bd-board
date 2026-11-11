import { clsx } from 'clsx'
import type { ClassValue } from 'clsx'
import { extendTailwindMerge } from 'tailwind-merge'

import { stripMigrationGate } from './migration-gate.ts'

/*
 * Custom @theme scales from src/styles.css. Without them tailwind-merge reads
 * `text-badge` as a text color and drops it next to `text-muted-foreground`.
 */
const twMerge = extendTailwindMerge({
  extend: {
    theme: {
      text: ['badge', 'body', 'title', 'metric'],
      spacing: ['row', 'section', 'page', 'rail'],
    },
  },
})

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs))
}

export function initials(name: string): string {
  const parts = name
    .trim()
    .split(/[\s_@.-]+/)
    .filter(Boolean)
  if (parts.length === 0) return '?'
  if (parts.length === 1) return parts[0].slice(0, 2).toUpperCase()
  return (parts[0][0] + parts[1][0]).toUpperCase()
}

export function toErrorMessage(err: unknown, fallback: string): string {
  if (typeof err === 'string') return stripMigrationGate(err)
  if (err instanceof Error) return stripMigrationGate(err.message)
  return fallback
}
