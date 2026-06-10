import type { KnowledgeType } from './types'

const PREFIX_TO_TYPE: Record<string, KnowledgeType> = {
  LEARNED: 'learned',
  DECISION: 'decision',
  FACT: 'fact',
  PATTERN: 'pattern',
  INVESTIGATION: 'investigation',
  'MUST-CHECK': 'must-check',
  DEVIATION: 'deviation',
}

export const KNOWLEDGE_TYPES: KnowledgeType[] = [
  'learned',
  'decision',
  'fact',
  'pattern',
  'investigation',
  'must-check',
  'deviation',
]

export const KNOWLEDGE_TYPE_LABEL: Record<KnowledgeType, string> = {
  learned: 'Learned',
  decision: 'Decision',
  fact: 'Fact',
  pattern: 'Pattern',
  investigation: 'Investigation',
  'must-check': 'Must-check',
  deviation: 'Deviation',
}

export function parseKnowledgeCommentText(
  text: string,
): { type: KnowledgeType; content: string } | null {
  const match = text.match(
    /^\s*(LEARNED|DECISION|FACT|PATTERN|INVESTIGATION|MUST-CHECK|DEVIATION):\s*([\s\S]*)$/i,
  )
  if (!match) return null

  const prefix = match[1].toUpperCase()
  const type = PREFIX_TO_TYPE[prefix]
  const content = match[2].trim()
  if (!content) return null

  return { type, content }
}
