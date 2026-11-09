/**
 * Soft install prompt for the GYM CONTROL PWA.
 * Chromium: captures beforeinstallprompt and offers native install.
 * iOS: shows Add to Home Screen instructions (no native prompt API).
 * Never shown when already installed or recently dismissed.
 */

export const STORAGE_DISMISS = 'gym-pwa-install-dismissed-at'
export const STORAGE_INSTALLED = 'gym-pwa-installed'
export const DISMISS_MS = 14 * 24 * 60 * 60 * 1000
export const SHOW_DELAY_MS = 1600

/** @returns {boolean} */
export function isRunningAsInstalledApp() {
  if (typeof window === 'undefined') return false
  const standaloneMq =
    typeof window.matchMedia === 'function' &&
    window.matchMedia('(display-mode: standalone)').matches
  const fullscreenMq =
    typeof window.matchMedia === 'function' &&
    window.matchMedia('(display-mode: fullscreen)').matches
  const iosStandalone =
    /** @type {Navigator & { standalone?: boolean }} */ (navigator).standalone === true
  return Boolean(standaloneMq || fullscreenMq || iosStandalone)
}

/** @returns {boolean} */
export function isIosDevice() {
  if (typeof navigator === 'undefined') return false
  const ua = navigator.userAgent || ''
  if (/iPad|iPhone|iPod/.test(ua)) return true
  // iPadOS reports as MacIntel with touch
  return navigator.platform === 'MacIntel' && navigator.maxTouchPoints > 1
}

/** @param {Storage | null | undefined} store */
export function wasDismissedRecently(store = safeStorage()) {
  if (!store) return false
  try {
    if (store.getItem(STORAGE_INSTALLED) === '1') return true
    const raw = store.getItem(STORAGE_DISMISS)
    if (!raw) return false
    const at = Number(raw)
    if (!Number.isFinite(at)) return false
    return Date.now() - at < DISMISS_MS
  } catch {
    return false
  }
}

/** @param {Storage | null | undefined} store */
export function markDismissed(store = safeStorage()) {
  try {
    store?.setItem(STORAGE_DISMISS, String(Date.now()))
  } catch {
    /* ignore quota / private mode */
  }
}

/** @param {Storage | null | undefined} store */
export function markInstalled(store = safeStorage()) {
  try {
    store?.setItem(STORAGE_INSTALLED, '1')
    store?.removeItem(STORAGE_DISMISS)
  } catch {
    /* ignore */
  }
}

/** @returns {Storage | null} */
function safeStorage() {
  try {
    return window.localStorage
  } catch {
    return null
  }
}

/**
 * @typedef {'chromium' | 'ios'} PromptMode
 */

/**
 * @param {{ mode: PromptMode, onInstall?: () => void | Promise<void>, onDismiss: () => void }} opts
 * @returns {HTMLElement}
 */
export function buildInstallBanner({ mode, onInstall, onDismiss }) {
  const el = document.createElement('aside')
  el.className = 'pwa-install-banner'
  el.setAttribute('role', 'dialog')
  el.setAttribute('aria-live', 'polite')
  el.setAttribute('aria-label', 'پیشنهاد نصب وب‌اپلیکیشن')
  el.dataset.mode = mode

  const title =
    mode === 'ios' ? 'نصب روی صفحهٔ اصلی' : 'نصب وب‌اپلیکیشن باشگاه آذر'
  const body =
    mode === 'ios'
      ? 'از دکمهٔ Share مرورگر، گزینهٔ Add to Home Screen را بزنید تا مثل اپ باز شود.'
      : 'برای دسترسی سریع‌تر، GYM CONTROL را روی دستگاهتان نصب کنید.'

  el.innerHTML = `
    <div class="pwa-install-banner__mark" aria-hidden="true">
      <img src="/images/brand/logo-mark.svg" alt="" width="44" height="44" decoding="async" />
    </div>
    <div class="pwa-install-banner__copy">
      <p class="pwa-install-banner__title">${title}</p>
      <p class="pwa-install-banner__body">${body}</p>
    </div>
    <div class="pwa-install-banner__actions">
      ${
        mode === 'chromium'
          ? '<button type="button" class="btn small" data-pwa-install>نصب اپ</button>'
          : ''
      }
      <button type="button" class="btn ghost small" data-pwa-dismiss>${mode === 'ios' ? 'متوجه شدم' : 'الان نه'}</button>
    </div>
  `

  el.querySelector('[data-pwa-dismiss]')?.addEventListener('click', () => {
    onDismiss()
  })
  const installBtn = el.querySelector('[data-pwa-install]')
  if (installBtn && onInstall) {
    installBtn.addEventListener('click', () => {
      void onInstall()
    })
  }

  return el
}

/**
 * @param {HTMLElement} banner
 * @param {{ reduceMotion?: boolean }} [opts]
 */
export function showBanner(banner, opts = {}) {
  const reduce =
    opts.reduceMotion ??
    (typeof window.matchMedia === 'function' &&
      window.matchMedia('(prefers-reduced-motion: reduce)').matches)
  document.body.appendChild(banner)
  if (reduce) {
    banner.classList.add('is-visible')
    return
  }
  requestAnimationFrame(() => {
    banner.classList.add('is-visible')
  })
}

/**
 * @param {HTMLElement | null} banner
 * @param {{ reduceMotion?: boolean }} [opts]
 */
export function hideBanner(banner, opts = {}) {
  if (!banner || !banner.isConnected) return
  const reduce =
    opts.reduceMotion ??
    (typeof window.matchMedia === 'function' &&
      window.matchMedia('(prefers-reduced-motion: reduce)').matches)
  banner.classList.remove('is-visible')
  banner.classList.add('is-leaving')
  if (reduce) {
    banner.remove()
    return
  }
  window.setTimeout(() => {
    banner.remove()
  }, 320)
}

/**
 * @param {{
 *   delayMs?: number,
 *   storage?: Storage | null,
 * }} [options]
 * @returns {{ destroy: () => void }}
 */
export function initPwaInstallPrompt(options = {}) {
  const delayMs = options.delayMs ?? SHOW_DELAY_MS
  const store = options.storage === undefined ? safeStorage() : options.storage

  /** @type {BeforeInstallPromptEvent | null} */
  let deferred = null
  /** @type {HTMLElement | null} */
  let banner = null
  /** @type {number | undefined} */
  let showTimer
  let destroyed = false

  if (isRunningAsInstalledApp() || wasDismissedRecently(store)) {
    return { destroy }
  }

  function dismiss() {
    markDismissed(store)
    hideBanner(banner)
    banner = null
  }

  async function runNativeInstall() {
    if (!deferred) return
    try {
      await deferred.prompt()
      const choice = await deferred.userChoice
      deferred = null
      if (choice?.outcome === 'accepted') {
        markInstalled(store)
        hideBanner(banner)
        banner = null
      } else {
        dismiss()
      }
    } catch {
      dismiss()
    }
  }

  function mountChromium() {
    if (destroyed || banner || !deferred) return
    banner = buildInstallBanner({
      mode: 'chromium',
      onInstall: runNativeInstall,
      onDismiss: dismiss,
    })
    showBanner(banner)
  }

  function mountIos() {
    if (destroyed || banner) return
    banner = buildInstallBanner({
      mode: 'ios',
      onDismiss: dismiss,
    })
    showBanner(banner)
  }

  /** @param {Event} ev */
  function onBeforeInstall(ev) {
    ev.preventDefault()
    deferred = /** @type {BeforeInstallPromptEvent} */ (ev)
    if (showTimer) window.clearTimeout(showTimer)
    showTimer = window.setTimeout(() => {
      mountChromium()
    }, delayMs)
  }

  function onAppInstalled() {
    markInstalled(store)
    hideBanner(banner)
    banner = null
    deferred = null
  }

  window.addEventListener('beforeinstallprompt', onBeforeInstall)
  window.addEventListener('appinstalled', onAppInstalled)

  // iOS has no beforeinstallprompt — offer Share instructions after a short delay.
  if (isIosDevice()) {
    showTimer = window.setTimeout(() => {
      if (!deferred) mountIos()
    }, delayMs)
  }

  function destroy() {
    destroyed = true
    if (showTimer) window.clearTimeout(showTimer)
    window.removeEventListener('beforeinstallprompt', onBeforeInstall)
    window.removeEventListener('appinstalled', onAppInstalled)
    hideBanner(banner, { reduceMotion: true })
    banner = null
    deferred = null
  }

  return { destroy }
}

/**
 * @typedef {Event & {
 *   prompt: () => Promise<void>,
 *   userChoice: Promise<{ outcome: 'accepted' | 'dismissed' }>,
 * }} BeforeInstallPromptEvent
 */
