// @vitest-environment jsdom
import { renderHook, waitFor } from '@testing-library/react'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import type { Project } from '@/lib/types'

import { useValidateProjectsOnMount } from '@/lib/useValidateProjectsOnMount'

const server = vi.hoisted(() => ({
  isDesktopApp: vi.fn(),
  checkProjectPath: vi.fn(),
}))
vi.mock('@/lib/server', () => server)

const project: Project = {
  id: 'ledger',
  name: 'ledger',
  dir: '/work/ledger',
  beadsPath: '/work/ledger/.beads',
  prefix: 'ldg',
  external: false,
  missing: false,
  error: null,
  counts: { open: 1, in_progress: 0, blocked: 0, closed: 0 },
} as Project
const projects = [project]

describe('useValidateProjectsOnMount', () => {
  beforeEach(() => {
    server.isDesktopApp.mockReset()
    server.checkProjectPath.mockReset()
  })

  it('does not flag projects as broken in the browser, where path checks are unavailable', async () => {
    server.isDesktopApp.mockReturnValue(false)
    server.checkProjectPath.mockRejectedValue(
      new Error('requires the desktop app'),
    )

    const { result } = renderHook(() => useValidateProjectsOnMount(projects))

    await waitFor(() => expect(result.current.isLoading).toBe(false))
    expect(server.checkProjectPath).not.toHaveBeenCalled()
    expect(result.current.brokenProjects).toEqual([])
    expect(result.current.currentBrokenProject).toBeNull()
  })

  it('still reports an invalid project in the desktop app', async () => {
    server.isDesktopApp.mockReturnValue(true)
    server.checkProjectPath.mockResolvedValue({
      kind: 'invalid',
      reason: 'missing',
    })

    const { result } = renderHook(() => useValidateProjectsOnMount(projects))

    await waitFor(() => expect(result.current.brokenProjects).toHaveLength(1))
    expect(server.checkProjectPath).toHaveBeenCalledWith('/work/ledger')
    expect(result.current.currentBrokenProject?.project.id).toBe('ledger')
  })
})
