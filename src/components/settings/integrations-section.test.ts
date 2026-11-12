import { describe, expect, it } from 'vitest'

import { saveKeyErrorMessage } from './integrations-section'

describe('saveKeyErrorMessage', () => {
  it('replaces the git-tracked config refusal with guidance that avoids --force', () => {
    const bdText =
      'Error: refusing to write secret key "linear.api_key" to git-tracked config file /p/.beads/config.yaml\n\nTo override: bd config set --force-git-tracked linear.api_key "value"'
    const message = saveKeyErrorMessage(new Error(bdText))
    expect(message).toContain('LINEAR_API_KEY')
    expect(message).toContain('untrack')
    expect(message).not.toContain('--force')
  })

  it('passes other errors through', () => {
    expect(saveKeyErrorMessage(new Error('bd failed'))).toBe('bd failed')
    expect(saveKeyErrorMessage('plain')).toBe('plain')
  })
})
