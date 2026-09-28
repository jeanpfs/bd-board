import { describe, expect, it } from 'vitest'
import { parseFeedLine, drainJournal, TRUNCATED_CODE } from './bead-feed-server'

describe('bead-feed-server', () => {
  describe('parseFeedLine', () => {
    it('parses a record with issue_id and dep.target', () => {
      const line =
        '{"seq":7,"op":"dep_add","issue_id":"a","dep":{"kind":"blocks","target":"b"}}'
      const result = parseFeedLine(line)
      expect(result).toEqual({
        kind: 'record',
        seq: 7,
        issueIds: ['a', 'b'],
      })
    })

    it('parses a truncation line', () => {
      const line = `{"code":"${TRUNCATED_CODE}","error":"journal truncated","floor":10,"head":100,"since":50}`
      const result = parseFeedLine(line)
      expect(result).toEqual({
        kind: 'truncated',
        head: 100,
      })
    })

    it('returns null for a note line', () => {
      const line = 'note: the events journal is disabled for this workspace'
      const result = parseFeedLine(line)
      expect(result).toBeNull()
    })

    it('returns null for garbage text', () => {
      const line = 'this is not json'
      const result = parseFeedLine(line)
      expect(result).toBeNull()
    })

    it('returns null for blank lines', () => {
      const result = parseFeedLine('')
      expect(result).toBeNull()
    })
  })

  describe('drainJournal', () => {
    it('returns disabled when first call has JOURNAL_DISABLED_MARKER in stderr', async () => {
      const exec = async (_args: string[]) => ({
        code: 0,
        stdout: '',
        stderr:
          'note: the events journal is disabled for this workspace; enable with "bd config set events-journal true"',
      })

      const result = await drainJournal(exec, 0)
      expect(result).toEqual({ kind: 'disabled' })
    })

    it('paginates through records and returns ready with the last seq', async () => {
      const callArgs: string[][] = []
      let callCount = 0

      const exec = async (args: string[]) => {
        callArgs.push(args)
        callCount++

        if (callCount === 1) {
          // First page: 1000 records (seq 1..1000)
          const lines = Array.from({ length: 1000 }, (_, i) => {
            const seq = i + 1
            return JSON.stringify({
              seq,
              op: 'dep_add',
              issue_id: `issue-${seq}`,
            })
          })
          return { code: 0, stdout: lines.join('\n'), stderr: '' }
        } else if (callCount === 2) {
          // Second page: 3 records (seq 1001..1003)
          const lines = Array.from({ length: 3 }, (_, i) => {
            const seq = 1000 + i + 1
            return JSON.stringify({
              seq,
              op: 'dep_add',
              issue_id: `issue-${seq}`,
            })
          })
          return { code: 0, stdout: lines.join('\n'), stderr: '' }
        }

        return { code: 0, stdout: '', stderr: '' }
      }

      const result = await drainJournal(exec, 0)

      expect(result).toEqual({ kind: 'ready', seq: 1003 })
      expect(callArgs[1]).toContain('--since')
      expect(callArgs[1]).toContain('1000')
    })

    it('returns ready with truncation head when exit 1 with truncation stdout', async () => {
      const exec = async (_args: string[]) => {
        const truncLine = JSON.stringify({
          code: TRUNCATED_CODE,
          error: 'journal truncated',
          floor: 0,
          head: 980,
          since: 0,
        })
        return { code: 1, stdout: truncLine, stderr: '' }
      }

      const result = await drainJournal(exec, 0)

      expect(result).toEqual({ kind: 'ready', seq: 980 })
    })

    it('returns unsupported with error message when exit 1 without truncation', async () => {
      const exec = async (_args: string[]) => ({
        code: 127,
        stdout: '',
        stderr: 'Error: unknown command "events" for "bd"',
      })

      const result = await drainJournal(exec, 0)

      expect(result.kind).toBe('unsupported')
      expect(
        (result as { kind: 'unsupported'; message: string }).message,
      ).toContain('unknown command')
    })

    it('handles stale checkpoint: resets to 0 when validation call finds nothing', async () => {
      const callArgs: string[][] = []

      const exec = async (args: string[]) => {
        callArgs.push(args)

        if (callArgs.length === 1) {
          // First page is empty (journal was reset or recreated)
          return { code: 0, stdout: '', stderr: '' }
        } else if (callArgs.length === 2) {
          // Validation call at since=49 returns empty
          return { code: 0, stdout: '', stderr: '' }
        } else if (callArgs.length === 3) {
          // Drain from since=0: return records 1..100
          const lines = Array.from({ length: 100 }, (_, i) => {
            const seq = i + 1
            return JSON.stringify({
              seq,
              op: 'dep_add',
              issue_id: `issue-${seq}`,
            })
          })
          return { code: 0, stdout: lines.join('\n'), stderr: '' }
        }

        return { code: 0, stdout: '', stderr: '' }
      }

      const result = await drainJournal(exec, 50)

      expect(result).toEqual({ kind: 'ready', seq: 100 })
      // First call at since=50, then validation at since=49, then drain at since=0
      expect(callArgs.length).toBeGreaterThanOrEqual(3)
    })

    it('accepts valid checkpoint when validation finds the record at cur', async () => {
      const callArgs: string[][] = []

      const exec = async (args: string[]) => {
        callArgs.push(args)

        if (callArgs.length === 1) {
          // First page is empty, but checkpoint is at 50
          return { code: 0, stdout: '', stderr: '' }
        } else if (callArgs.length === 2) {
          // Validation call at since=49 returns the record with seq=50
          return {
            code: 0,
            stdout: JSON.stringify({ seq: 50, op: 'dep_add', issue_id: 'x' }),
            stderr: '',
          }
        }

        return { code: 0, stdout: '', stderr: '' }
      }

      const result = await drainJournal(exec, 50)

      expect(result).toEqual({ kind: 'ready', seq: 50 })
      // First call at since=50, validation at since=49, then done (no reset)
      expect(callArgs.length).toBe(2)
    })
  })
})
