import { formatDistance } from 'date-fns'
import { enUS } from 'date-fns/locale'

/** `3 days ago`; empty for a missing or unparsable timestamp. */
export function relativeDate(value?: string, now?: Date): string {
  if (!value) return ''
  const parsed = new Date(value)
  if (Number.isNaN(parsed.getTime())) return ''
  return formatDistance(parsed, now ?? new Date(), {
    addSuffix: true,
    locale: enUS,
  })
}
