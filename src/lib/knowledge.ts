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

export const KNOWLEDGE_TYPE_HINT: Record<KnowledgeType, string> = {
  learned: 'Something the work taught us that was not obvious going in.',
  decision: 'A choice that was made, so it is not re-litigated later.',
  fact: 'A verifiable property of the system or its tooling.',
  pattern: 'A convention that should hold across the codebase.',
  investigation: 'A finding from a diagnosis, still open-ended.',
  'must-check': 'A trap someone will fall into unless they check first.',
  deviation: 'Where reality departed from the documented process.',
}

export const KNOWLEDGE_TYPE_PREFIX: Record<KnowledgeType, string> = {
  learned: 'LEARNED',
  decision: 'DECISION',
  fact: 'FACT',
  pattern: 'PATTERN',
  investigation: 'INVESTIGATION',
  'must-check': 'MUST-CHECK',
  deviation: 'DEVIATION',
}

export const KNOWLEDGE_TYPE_DOT_CLASS: Record<KnowledgeType, string> = {
  learned: 'bg-k-learned',
  decision: 'bg-k-decision',
  fact: 'bg-k-fact',
  pattern: 'bg-k-pattern',
  investigation: 'bg-k-investigation',
  'must-check': 'bg-k-must-check',
  deviation: 'bg-k-deviation',
}

export const KNOWLEDGE_TYPE_TEXT_CLASS: Record<KnowledgeType, string> = {
  learned: 'text-k-learned',
  decision: 'text-k-decision',
  fact: 'text-k-fact',
  pattern: 'text-k-pattern',
  investigation: 'text-k-investigation',
  'must-check': 'text-k-must-check',
  deviation: 'text-k-deviation',
}

export const KNOWLEDGE_TYPE_BG_CLASS: Record<KnowledgeType, string> = {
  learned: 'bg-k-learned/15',
  decision: 'bg-k-decision/15',
  fact: 'bg-k-fact/15',
  pattern: 'bg-k-pattern/15',
  investigation: 'bg-k-investigation/15',
  'must-check': 'bg-k-must-check/15',
  deviation: 'bg-k-deviation/15',
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
