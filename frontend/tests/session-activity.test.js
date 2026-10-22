import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

vi.mock('../assets/js/api.js', () => ({
  apiPost: vi.fn(),
}))

import { apiPost } from '../assets/js/api.js'
import { startSessionActivityGuard } from '../assets/js/session-activity.js'

describe('session activity guard', () => {
  beforeEach(() => {
    vi.useFakeTimers()
    vi.mocked(apiPost).mockReset()
    vi.mocked(apiPost).mockResolvedValue({ detail: 'ok' })
    // jsdom location is tricky — stub assign via href setter path used by guard
    delete window.location
    window.location = /** @type {any} */ ({
      href: 'http://localhost/manager/#dash',
      pathname: '/manager/',
      hash: '#dash',
    })
  })

  afterEach(() => {
    vi.useRealTimers()
    document.body.innerHTML = ''
  })

  it('touches server on start and logs out after idle timeout', async () => {
    const stop = startSessionActivityGuard({
      idleMs: 5 * 60 * 1000,
      touchMinIntervalMs: 1_000,
    })

    expect(apiPost).toHaveBeenCalledWith('/api/v1/auth/touch')

    await vi.advanceTimersByTimeAsync(5 * 60 * 1000)
    expect(apiPost).toHaveBeenCalledWith('/api/v1/auth/logout')
    expect(String(window.location.href)).toContain('/login/')

    stop()
  })

  it('resets idle timer on user activity', async () => {
    const stop = startSessionActivityGuard({
      idleMs: 5 * 60 * 1000,
      touchMinIntervalMs: 1,
    })

    await vi.advanceTimersByTimeAsync(4 * 60 * 1000)
    window.dispatchEvent(new Event('pointerdown'))
    await vi.advanceTimersByTimeAsync(4 * 60 * 1000)
    // Still inside a fresh 5-minute window after activity — no logout yet
    expect(String(window.location.href)).not.toContain('/login/')

    await vi.advanceTimersByTimeAsync(60_000)
    expect(String(window.location.href)).toContain('/login/')
    stop()
  })
})
