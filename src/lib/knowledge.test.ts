import { describe, expect, it } from 'vitest'

import {
  KNOWLEDGE_TYPES,
  formatKnowledgeComment,
  parseKnowledgeCommentText,
} from './knowledge'

describe('parseKnowledgeCommentText', () => {
  it('extracts structured knowledge prefixes from comments', () => {
    expect(parseKnowledgeCommentText('LEARNED: CI uses Node 24')).toEqual({
      type: 'learned',
      content: 'CI uses Node 24',
    })
    expect(
      parseKnowledgeCommentText(
        'DECISION: Use comments as the source of truth',
      ),
    ).toEqual({
      type: 'decision',
      content: 'Use comments as the source of truth',
    })
  })

  it('supports operational prefixes used by agents', () => {
    expect(
      parseKnowledgeCommentText('MUST-CHECK: Verify CI annotations'),
    ).toEqual({
      type: 'must-check',
      content: 'Verify CI annotations',
    })
    expect(
      parseKnowledgeCommentText('DEVIATION: Fixed blocking setup'),
    ).toEqual({
      type: 'deviation',
      content: 'Fixed blocking setup',
    })
  })

  it('is case-insensitive but requires non-empty content', () => {
    expect(
      parseKnowledgeCommentText('fact: bd stores comments in Dolt'),
    ).toEqual({
      type: 'fact',
      content: 'bd stores comments in Dolt',
    })
    expect(parseKnowledgeCommentText('PATTERN:   ')).toBeNull()
  })

  it('ignores regular comments', () => {
    expect(parseKnowledgeCommentText('Looks good to me')).toBeNull()
    expect(
      parseKnowledgeCommentText('Almost LEARNED: but not a prefix'),
    ).toBeNull()
  })
})

describe('formatKnowledgeComment', () => {
  it('writes text that reads back as the same type and content', () => {
    for (const type of KNOWLEDGE_TYPES) {
      const text = formatKnowledgeComment(type, '  Line one\nline two  ')
      expect(parseKnowledgeCommentText(text)).toEqual({
        type,
        content: 'Line one\nline two',
      })
    }
  })
})
