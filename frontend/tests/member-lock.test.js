import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

vi.mock('../assets/js/api.js', () => ({
  ApiError: class ApiError extends Error {
    constructor(status, message, detail) {
      super(message)
      this.status = status
      this.detail = detail
    }
  },
  apiErrorMessage: (err, fallback) => (err && err.message) || fallback,
  apiGet: vi.fn(),
  apiPost: vi.fn(),
}))

import { apiGet, apiPost } from '../assets/js/api.js'
import { createMemberLock } from '../assets/js/lock.js'

describe('createMemberLock live poll', () => {
  beforeEach(() => {
    vi.useFakeTimers()
    vi.mocked(apiGet).mockReset()
    vi.mocked(apiPost).mockReset()
  })

  afterEach(() => {
    vi.useRealTimers()
  })

  it('polls and auto-acquires after another desk releases the lock', async () => {
    /** @type {Array<{ held?: boolean, err?: string | null }>} */
    const paints = []
    const locker = createMemberLock((st, err) => {
      paints.push({ held: !!(st && st.held_by_me), err })
    }, { pollMs: 1000, touchMs: 60_000 })

    vi.mocked(apiPost).mockImplementation(async (url) => {
      if (String(url).endsWith('/lock') && !String(url).includes('touch')) {
        return {
          locked: true,
          member_id: 7,
          held_by_me: false,
          locked_by_name: 'منشی دو',
          expires_at: '2026-10-31T12:00:00+03:30',
        }
      }
      return { locked: false, member_id: 7, held_by_me: false }
    })

    await locker.setMember(7)
    expect(paints.at(-1)?.held).toBe(false)
    expect(paints.at(-1)?.err).toMatch(/منشی دو|قفل/)

    // Now free on GET; next acquire succeeds
    vi.mocked(apiGet).mockResolvedValue({
      locked: false,
      member_id: 7,
      held_by_me: false,
    })
    vi.mocked(apiPost).mockImplementation(async (url) => {
      if (String(url).endsWith('/lock') && !String(url).includes('touch') && !String(url).includes('unlock')) {
        return { locked: true, member_id: 7, held_by_me: true, expires_at: '2026-10-31T12:05:00+03:30' }
      }
      return { locked: false, member_id: 7, held_by_me: false }
    })

    await vi.advanceTimersByTimeAsync(1000)
    await Promise.resolve()
    await Promise.resolve()

    expect(paints.some((p) => p.held)).toBe(true)
    expect(locker.memberId).toBe(7)

    await locker.setMember(null)
  })

  it('after release does not immediately re-acquire (lets other desks take it)', async () => {
    const paints = []
    const locker = createMemberLock((st) => {
      paints.push({ held: !!(st && st.held_by_me), locked: !!(st && st.locked) })
    }, { pollMs: 1000 })

    vi.mocked(apiPost).mockImplementation(async (url) => {
      if (String(url).includes('unlock')) {
        return { locked: false, member_id: 3, held_by_me: false }
      }
      return { locked: true, member_id: 3, held_by_me: true }
    })
    vi.mocked(apiGet).mockResolvedValue({ locked: false, member_id: 3, held_by_me: false })

    await locker.setMember(3)
    expect(locker.memberId).toBe(3)

    await locker.release()
    expect(locker.memberId).toBeNull()
    expect(paints.at(-1)?.held).toBe(false)

    const postsBefore = vi.mocked(apiPost).mock.calls.length
    await vi.advanceTimersByTimeAsync(3000)
    const acquireCalls = vi
      .mocked(apiPost)
      .mock.calls.slice(postsBefore)
      .filter(([url]) => String(url).endsWith('/lock') && !String(url).includes('touch'))
    expect(acquireCalls).toHaveLength(0)

    await locker.setMember(null)
  })

  it('while watching a free member, detects when another desk locks it', async () => {
    const paints = []
    const locker = createMemberLock((st, err) => {
      paints.push({ held: !!(st && st.held_by_me), err })
    }, { pollMs: 1000 })

    vi.mocked(apiPost).mockResolvedValue({ locked: true, member_id: 9, held_by_me: true })
    await locker.setMember(9)
    expect(locker.memberId).toBe(9)

    await locker.release()

    vi.mocked(apiGet).mockResolvedValue({
      locked: true,
      member_id: 9,
      held_by_me: false,
      locked_by_name: 'منشی سه',
    })
    await vi.advanceTimersByTimeAsync(1000)
    await Promise.resolve()

    expect(paints.at(-1)?.held).toBe(false)
    expect(paints.at(-1)?.err).toMatch(/منشی سه|قفل/)

    await locker.setMember(null)
  })
})
