import { formatDistanceToNow } from 'date-fns'
import { enUS } from 'date-fns/locale'

/** `3 days ago`; empty for a missing or unparsable timestamp. */
export function relativeDate(value?: string): string {
  if (!value) return ''
  const parsed = new Date(value)
  if (Number.isNaN(parsed.getTime())) return ''
  return formatDistanceToNow(parsed, { addSuffix: true, locale: enUS })
}
