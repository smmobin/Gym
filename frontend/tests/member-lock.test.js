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

  it('polls and enables UI when server hands lock to this desk (held_by_me)', async () => {
    /** @type {Array<{ held?: boolean, err?: string | null }>} */
    const paints = []
    const locker = createMemberLock((st, err) => {
      paints.push({ held: !!(st && st.held_by_me), err })
    }, { pollMs: 1000, touchMs: 60_000 })

    vi.mocked(apiPost).mockResolvedValue({
      locked: true,
      member_id: 7,
      held_by_me: false,
      locked_by_name: 'منشی دو',
    })
    await locker.setMember(7)
    expect(paints.at(-1)?.held).toBe(false)

    vi.mocked(apiGet).mockResolvedValue({
      locked: true,
      member_id: 7,
      held_by_me: true,
      expires_at: '2026-10-31T12:05:00+03:30',
    })
    await vi.advanceTimersByTimeAsync(1000)
    await Promise.resolve()

    expect(paints.at(-1)?.held).toBe(true)
    expect(locker.memberId).toBe(7)

    await locker.setMember(null)
  })

  it('after unlock shows conflict when server handed lock to another desk', async () => {
    const paints = []
    const locker = createMemberLock((st, err) => {
      paints.push({ held: !!(st && st.held_by_me), err })
    }, { pollMs: 1000 })

    vi.mocked(apiPost).mockImplementation(async (url) => {
      if (String(url).includes('unlock')) {
        return {
          locked: true,
          member_id: 3,
          held_by_me: false,
          locked_by_name: 'منشی آخر',
        }
      }
      return { locked: true, member_id: 3, held_by_me: true }
    })

    await locker.setMember(3)
    expect(locker.memberId).toBe(3)

    await locker.release()
    expect(locker.memberId).toBeNull()
    expect(paints.at(-1)?.held).toBe(false)
    expect(paints.at(-1)?.err).toMatch(/منشی آخر|قفل/)

    await locker.setMember(null)
  })

  it('when lock becomes free, acquires for this desk', async () => {
    const paints = []
    const locker = createMemberLock((st, err) => {
      paints.push({ held: !!(st && st.held_by_me), err })
    }, { pollMs: 1000 })

    vi.mocked(apiPost).mockResolvedValueOnce({
      locked: true,
      member_id: 5,
      held_by_me: false,
      locked_by_name: 'A',
    })
    await locker.setMember(5)

    vi.mocked(apiGet).mockResolvedValue({ locked: false, member_id: 5, held_by_me: false })
    vi.mocked(apiPost).mockResolvedValue({
      locked: true,
      member_id: 5,
      held_by_me: true,
    })

    await vi.advanceTimersByTimeAsync(1000)
    await Promise.resolve()
    await Promise.resolve()

    expect(paints.at(-1)?.held).toBe(true)
    await locker.setMember(null)
  })
})
