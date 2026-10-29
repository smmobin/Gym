import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

import {
  setStatus,
  showToast,
  toastDismissThresholdPx,
  toastSwipeShouldDismiss,
  TOAST_SWIPE,
} from '../assets/js/ui.js'

/**
 * @param {HTMLElement} el
 * @param {number} width
 */
function stubToastWidth(el, width = 280) {
  Object.defineProperty(el, 'offsetWidth', { configurable: true, get: () => width })
}

/**
 * @param {Element} target
 * @param {string} type
 * @param {Partial<PointerEventInit> & { clientX: number, clientY?: number, pointerId?: number }} init
 */
function dispatchPointer(target, type, init) {
  const event = new PointerEvent(type, {
    bubbles: true,
    cancelable: true,
    pointerId: init.pointerId ?? 1,
    pointerType: 'touch',
    clientX: init.clientX,
    clientY: init.clientY ?? 40,
    button: 0,
    buttons: type === 'pointerdown' || type === 'pointermove' ? 1 : 0,
    ...init,
  })
  target.dispatchEvent(event)
}

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

  it('toastDismissThresholdPx uses max of min-px and ratio', () => {
    expect(toastDismissThresholdPx(200)).toBe(TOAST_SWIPE.DISMISS_MIN_PX)
    expect(toastDismissThresholdPx(400)).toBe(400 * TOAST_SWIPE.DISMISS_RATIO)
  })

  it('toastSwipeShouldDismiss only accepts rightward past threshold', () => {
    expect(toastSwipeShouldDismiss(0, 280)).toBe(false)
    expect(toastSwipeShouldDismiss(-40, 280)).toBe(false)
    expect(toastSwipeShouldDismiss(40, 280)).toBe(false)
    expect(toastSwipeShouldDismiss(toastDismissThresholdPx(280), 280)).toBe(true)
    expect(toastSwipeShouldDismiss(200, 280)).toBe(true)
  })

  it('swipe right past threshold dismisses toast', async () => {
    const toast = showToast('بکش به راست', 'ok')
    expect(toast).toBeTruthy()
    stubToastWidth(/** @type {HTMLElement} */ (toast), 280)
    const threshold = toastDismissThresholdPx(280)

    dispatchPointer(/** @type {HTMLElement} */ (toast), 'pointerdown', { clientX: 100, clientY: 40 })
    dispatchPointer(/** @type {HTMLElement} */ (toast), 'pointermove', {
      clientX: 100 + threshold + 20,
      clientY: 42,
    })
    dispatchPointer(/** @type {HTMLElement} */ (toast), 'pointerup', {
      clientX: 100 + threshold + 20,
      clientY: 42,
    })

    await vi.advanceTimersByTimeAsync(TOAST_SWIPE.EXIT_MS + 40)
    expect(document.querySelector('.gym-toast')).toBeNull()
  })

  it('short swipe snaps back and keeps toast', async () => {
    const toast = showToast('کوتاه', 'ok')
    expect(toast).toBeTruthy()
    stubToastWidth(/** @type {HTMLElement} */ (toast), 280)

    dispatchPointer(/** @type {HTMLElement} */ (toast), 'pointerdown', { clientX: 120, clientY: 50 })
    dispatchPointer(/** @type {HTMLElement} */ (toast), 'pointermove', { clientX: 150, clientY: 50 })
    dispatchPointer(/** @type {HTMLElement} */ (toast), 'pointerup', { clientX: 150, clientY: 50 })

    expect(document.querySelector('.gym-toast')).toBeTruthy()
    expect(toast?.classList.contains('is-snap-back') || toast?.classList.contains('is-in')).toBe(true)
  })

  it('drag pauses auto-dismiss until gesture ends', async () => {
    const toast = showToast('درگ طولانی', 'ok')
    expect(toast).toBeTruthy()
    stubToastWidth(/** @type {HTMLElement} */ (toast), 280)

    dispatchPointer(/** @type {HTMLElement} */ (toast), 'pointerdown', { clientX: 80, clientY: 30 })
    dispatchPointer(/** @type {HTMLElement} */ (toast), 'pointermove', { clientX: 120, clientY: 30 })

    await vi.advanceTimersByTimeAsync(6000)
    expect(document.querySelector('.gym-toast')).toBeTruthy()

    dispatchPointer(/** @type {HTMLElement} */ (toast), 'pointerup', { clientX: 120, clientY: 30 })
    expect(document.querySelector('.gym-toast')).toBeTruthy()

    await vi.advanceTimersByTimeAsync(5000)
    expect(document.querySelector('.gym-toast')).toBeNull()
  })

  it('prefers-reduced-motion still shows toast and closes with ×', async () => {
    const matchMedia = vi.fn().mockImplementation((query) => ({
      matches: String(query).includes('prefers-reduced-motion'),
      media: query,
      addEventListener: vi.fn(),
      removeEventListener: vi.fn(),
      addListener: vi.fn(),
      removeListener: vi.fn(),
      dispatchEvent: vi.fn(),
      onchange: null,
    }))
    vi.stubGlobal('matchMedia', matchMedia)
    try {
      const toast = showToast('بدون حرکت سنگین', 'ok')
      expect(toast?.classList.contains('is-in')).toBe(true)
      expect(toast?.classList.contains('is-reduced')).toBe(true)

      toast?.querySelector('.gym-toast-close')?.dispatchEvent(new MouseEvent('click', { bubbles: true }))
      expect(document.querySelector('.gym-toast')).toBeNull()
    } finally {
      vi.unstubAllGlobals()
    }
  })
})
