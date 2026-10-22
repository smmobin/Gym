import { afterEach, describe, expect, it, vi } from 'vitest'

import { bindLiveSearch, debounce } from '../assets/js/live-search.js'

describe('live-search', () => {
  afterEach(() => {
    vi.useRealTimers()
    document.body.innerHTML = ''
  })

  it('debounce waits before calling', () => {
    vi.useFakeTimers()
    const fn = vi.fn()
    const d = debounce(fn, 200)
    d('a')
    d('ab')
    expect(fn).not.toHaveBeenCalled()
    vi.advanceTimersByTime(200)
    expect(fn).toHaveBeenCalledTimes(1)
    expect(fn).toHaveBeenCalledWith('ab')
  })

  it('bindLiveSearch runs on input without a search button', () => {
    vi.useFakeTimers()
    const input = document.createElement('input')
    input.type = 'search'
    document.body.appendChild(input)
    const onQuery = vi.fn()
    bindLiveSearch(input, onQuery, { delayMs: 150 })

    input.value = 'مه'
    input.dispatchEvent(new Event('input'))
    expect(onQuery).not.toHaveBeenCalled()
    vi.advanceTimersByTime(150)
    expect(onQuery).toHaveBeenCalledWith('مه')
  })
})
