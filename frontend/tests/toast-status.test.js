import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

import { setStatus, showToast } from '../assets/js/ui.js'

describe('floating toast status', () => {
  beforeEach(() => {
    vi.useFakeTimers()
    document.body.innerHTML = '<div class="status-msg" data-status hidden></div>'
  })

  afterEach(() => {
    vi.useRealTimers()
    document.getElementById('gym-toast-host')?.remove()
    document.body.innerHTML = ''
  })

  it('setStatus shows a toast top-host and keeps data-status hidden', () => {
    const slot = /** @type {HTMLElement} */ (document.querySelector('[data-status]'))
    setStatus(slot, 'درخواست تمدید برای میز ثبت شد.', 'ok')

    expect(slot.hidden).toBe(true)
    expect(slot.textContent).toBe('')
    const host = document.getElementById('gym-toast-host')
    expect(host).toBeTruthy()
    const toast = host?.querySelector('.gym-toast.ok')
    expect(toast?.textContent).toContain('درخواست تمدید')
    expect(toast?.querySelector('.gym-toast-close')?.getAttribute('aria-label')).toContain('بستن')
  })

  it('close button dismisses the toast', async () => {
    const toast = showToast('پیام تست', 'ok')
    expect(toast).toBeTruthy()
    toast?.querySelector('.gym-toast-close')?.dispatchEvent(new MouseEvent('click', { bubbles: true }))
    await vi.advanceTimersByTimeAsync(400)
    expect(document.querySelector('.gym-toast')).toBeNull()
  })

  it('ok toast auto-dismisses; loading stays until cleared', async () => {
    showToast('در حال بارگذاری…', 'loading')
    expect(document.querySelector('.gym-toast.loading')).toBeTruthy()
    await vi.advanceTimersByTimeAsync(5000)
    expect(document.querySelector('.gym-toast.loading')).toBeTruthy()

    setStatus(null, 'انجام شد.', 'ok')
    expect(document.querySelector('.gym-toast.loading')).toBeNull()
    expect(document.querySelector('.gym-toast.ok')).toBeTruthy()

    await vi.advanceTimersByTimeAsync(5000)
    expect(document.querySelector('.gym-toast.ok')).toBeNull()
  })

  it('empty setStatus clears loading toast', () => {
    const slot = /** @type {HTMLElement} */ (document.querySelector('[data-status]'))
    setStatus(slot, 'بارگذاری…', 'loading')
    setStatus(slot, '')
    expect(document.querySelector('.gym-toast')).toBeNull()
  })
})
