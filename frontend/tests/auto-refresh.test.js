import { afterEach, describe, expect, it, vi } from 'vitest'

import { createAutoRefresh } from '../assets/js/auto-refresh.js'

describe('createAutoRefresh', () => {
  afterEach(() => {
    vi.useRealTimers()
    document.body.innerHTML = ''
  })

  it('retries with backoff after load failure then recovers', async () => {
    vi.useFakeTimers()
    const root = document.createElement('div')
    document.body.appendChild(root)

    let attempts = 0
    const loadFn = vi.fn(async () => {
      attempts += 1
      if (attempts < 2) throw new Error('network')
    })

    const auto = createAutoRefresh(root, loadFn, {
      intervalMs: 30_000,
      retryBaseMs: 2_000,
      retryMaxMs: 10_000,
    })

    await vi.advanceTimersByTimeAsync(0)
    expect(loadFn).toHaveBeenCalledTimes(1)

    await vi.advanceTimersByTimeAsync(2_000)
    expect(loadFn).toHaveBeenCalledTimes(2)
    expect(attempts).toBe(2)

    await vi.advanceTimersByTimeAsync(30_000)
    expect(loadFn).toHaveBeenCalledTimes(3)

    auto.stop()
  })

  it('skips poll while data-section is hidden, runs when shown', async () => {
    vi.useFakeTimers()
    const section = document.createElement('div')
    section.setAttribute('data-section', 'plans')
    section.setAttribute('hidden', '')
    const root = document.createElement('div')
    section.appendChild(root)
    document.body.appendChild(section)

    const loadFn = vi.fn(async () => {})
    const auto = createAutoRefresh(root, loadFn, {
      intervalMs: 5_000,
      retryBaseMs: 1_000,
    })

    await vi.advanceTimersByTimeAsync(0)
    expect(loadFn).toHaveBeenCalledTimes(1)

    await vi.advanceTimersByTimeAsync(5_000)
    // still hidden → schedule again without calling load
    expect(loadFn).toHaveBeenCalledTimes(1)

    section.removeAttribute('hidden')
    window.dispatchEvent(new Event('hashchange'))
    await vi.advanceTimersByTimeAsync(0)
    expect(loadFn).toHaveBeenCalledTimes(2)

    auto.stop()
  })

  it('forces refresh when a subscribed live event fires', async () => {
    vi.useFakeTimers()
    const root = document.createElement('div')
    document.body.appendChild(root)
    const loadFn = vi.fn(async () => {})
    const auto = createAutoRefresh(root, loadFn, {
      intervalMs: 60_000,
      events: ['gym:live:plans'],
    })
    await vi.advanceTimersByTimeAsync(0)
    expect(loadFn).toHaveBeenCalledTimes(1)

    window.dispatchEvent(new Event('gym:live:plans'))
    await vi.advanceTimersByTimeAsync(0)
    expect(loadFn).toHaveBeenCalledTimes(2)

    auto.stop()
  })

  it('forwards live event detail and refresh extras to loadFn (focusId)', async () => {
    vi.useFakeTimers()
    const root = document.createElement('div')
    document.body.appendChild(root)
    const loadFn = vi.fn(async () => {})
    const auto = createAutoRefresh(root, loadFn, {
      intervalMs: 60_000,
      events: ['gym:live:classes'],
    })
    await vi.advanceTimersByTimeAsync(0)
    expect(loadFn).toHaveBeenCalledTimes(1)

    window.dispatchEvent(new CustomEvent('gym:live:classes', { detail: { focusId: 42 } }))
    await vi.advanceTimersByTimeAsync(0)
    expect(loadFn).toHaveBeenCalledTimes(2)
    expect(loadFn.mock.calls[1][0]).toMatchObject({ silent: false, focusId: 42 })

    await auto.refresh({ focusId: 99 })
    expect(loadFn).toHaveBeenCalledTimes(3)
    expect(loadFn.mock.calls[2][0]).toMatchObject({ silent: false, focusId: 99 })

    auto.stop()
  })
})
