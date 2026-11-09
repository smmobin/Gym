import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

import {
  DISMISS_MS,
  STORAGE_DISMISS,
  STORAGE_INSTALLED,
  buildInstallBanner,
  initPwaInstallPrompt,
  isRunningAsInstalledApp,
  markDismissed,
  markInstalled,
  wasDismissedRecently,
} from '../assets/js/pwa-install.js'

function memoryStorage() {
  /** @type {Record<string, string>} */
  const map = {}
  return {
    getItem: (k) => (k in map ? map[k] : null),
    setItem: (k, v) => {
      map[k] = String(v)
    },
    removeItem: (k) => {
      delete map[k]
    },
  }
}

describe('PWA install prompt helpers', () => {
  afterEach(() => {
    document.body.innerHTML = ''
    vi.unstubAllGlobals()
    vi.useRealTimers()
  })

  it('treats recent dismiss and installed flag as dismissed', () => {
    const store = memoryStorage()
    expect(wasDismissedRecently(store)).toBe(false)
    markDismissed(store)
    expect(wasDismissedRecently(store)).toBe(true)
    const old = String(Date.now() - DISMISS_MS - 1000)
    store.setItem(STORAGE_DISMISS, old)
    expect(wasDismissedRecently(store)).toBe(false)
    markInstalled(store)
    expect(store.getItem(STORAGE_INSTALLED)).toBe('1')
    expect(wasDismissedRecently(store)).toBe(true)
  })

  it('detects standalone display mode', () => {
    vi.stubGlobal('matchMedia', (query) => ({
      matches: String(query).includes('display-mode: standalone'),
      media: query,
      addEventListener: () => {},
      removeEventListener: () => {},
    }))
    expect(isRunningAsInstalledApp()).toBe(true)
  })

  it('builds chromium banner with install + dismiss actions', () => {
    const onInstall = vi.fn()
    const onDismiss = vi.fn()
    const el = buildInstallBanner({ mode: 'chromium', onInstall, onDismiss })
    document.body.appendChild(el)
    expect(el.dataset.mode).toBe('chromium')
    expect(el.textContent).toContain('نصب وب‌اپلیکیشن')
    el.querySelector('[data-pwa-install]')?.dispatchEvent(new Event('click'))
    el.querySelector('[data-pwa-dismiss]')?.dispatchEvent(new Event('click'))
    expect(onInstall).toHaveBeenCalledTimes(1)
    expect(onDismiss).toHaveBeenCalledTimes(1)
  })

  it('builds ios instructional banner without native install button', () => {
    const el = buildInstallBanner({ mode: 'ios', onDismiss: () => {} })
    expect(el.querySelector('[data-pwa-install]')).toBeNull()
    expect(el.textContent).toMatch(/Add to Home Screen/)
  })
})

describe('initPwaInstallPrompt', () => {
  /** @type {ReturnType<typeof initPwaInstallPrompt> | null} */
  let ctl = null

  beforeEach(() => {
    document.body.innerHTML = ''
    vi.useFakeTimers()
    vi.stubGlobal('matchMedia', (query) => ({
      matches: String(query).includes('prefers-reduced-motion'),
      media: query,
      addEventListener: () => {},
      removeEventListener: () => {},
    }))
  })

  afterEach(() => {
    ctl?.destroy()
    ctl = null
    document.body.innerHTML = ''
    vi.unstubAllGlobals()
    vi.useRealTimers()
  })

  it('shows chromium banner after beforeinstallprompt and installs on accept', async () => {
    const store = memoryStorage()
    ctl = initPwaInstallPrompt({ delayMs: 100, storage: store })

    const prompt = vi.fn(async () => {})
    const userChoice = Promise.resolve({ outcome: /** @type {const} */ ('accepted') })
    const ev = new Event('beforeinstallprompt', { cancelable: true })
    Object.assign(ev, { prompt, userChoice })
    window.dispatchEvent(ev)
    expect(ev.defaultPrevented).toBe(true)

    await vi.advanceTimersByTimeAsync(100)
    const banner = document.querySelector('.pwa-install-banner')
    expect(banner).toBeTruthy()
    expect(banner?.classList.contains('is-visible')).toBe(true)

    banner?.querySelector('[data-pwa-install]')?.dispatchEvent(new Event('click'))
    await Promise.resolve()
    await userChoice
    await Promise.resolve()

    expect(prompt).toHaveBeenCalledTimes(1)
    expect(store.getItem(STORAGE_INSTALLED)).toBe('1')
  })

  it('does not show when recently dismissed', async () => {
    const store = memoryStorage()
    store.setItem(STORAGE_DISMISS, String(Date.now()))
    ctl = initPwaInstallPrompt({ delayMs: 50, storage: store })

    const ev = new Event('beforeinstallprompt', { cancelable: true })
    Object.assign(ev, {
      prompt: async () => {},
      userChoice: Promise.resolve({ outcome: 'accepted' }),
    })
    window.dispatchEvent(ev)
    await vi.advanceTimersByTimeAsync(200)
    expect(document.querySelector('.pwa-install-banner')).toBeNull()
  })

  it('dismiss button stores dismissal and removes banner', async () => {
    const store = memoryStorage()
    ctl = initPwaInstallPrompt({ delayMs: 50, storage: store })
    const ev = new Event('beforeinstallprompt', { cancelable: true })
    Object.assign(ev, {
      prompt: async () => {},
      userChoice: Promise.resolve({ outcome: 'dismissed' }),
    })
    window.dispatchEvent(ev)
    await vi.advanceTimersByTimeAsync(50)

    document.querySelector('[data-pwa-dismiss]')?.dispatchEvent(new Event('click'))
    expect(store.getItem(STORAGE_DISMISS)).toBeTruthy()
    expect(document.querySelector('.pwa-install-banner')).toBeNull()
  })
})
