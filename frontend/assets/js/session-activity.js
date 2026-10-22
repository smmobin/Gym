import { apiPost } from './api.js'

const DEFAULT_IDLE_MS = 5 * 60 * 1000
const DEFAULT_TOUCH_MIN_MS = 30_000

/**
 * Keep the server session alive only on real user activity.
 * After `idleMs` without activity, logout and leave the panel.
 *
 * Background auto-refresh alone does NOT extend the session.
 *
 * @param {{
 *   touchPath?: string,
 *   logoutPath?: string,
 *   loginPath?: string,
 *   idleMs?: number,
 *   touchMinIntervalMs?: number,
 * }} [opts]
 * @returns {() => void} disposer
 */
export function startSessionActivityGuard(opts = {}) {
  const touchPath = opts.touchPath || '/api/v1/auth/touch'
  const logoutPath = opts.logoutPath || '/api/v1/auth/logout'
  const loginPath = opts.loginPath || '/login/'
  const idleMs = opts.idleMs ?? DEFAULT_IDLE_MS
  const touchMinIntervalMs = opts.touchMinIntervalMs ?? DEFAULT_TOUCH_MIN_MS

  let lastTouchAt = 0
  let touchInFlight = false
  let idleTimer = /** @type {ReturnType<typeof setTimeout> | null} */ (null)
  let leaving = false

  function goLogin() {
    if (leaving) return
    leaving = true
    const next = encodeURIComponent(location.pathname + location.hash)
    location.href = `${loginPath}?next=${next}`
  }

  async function forceLogout() {
    try {
      await apiPost(logoutPath)
    } catch {
      /* ignore — still leave the panel */
    }
    goLogin()
  }

  function resetIdleTimer() {
    if (idleTimer) clearTimeout(idleTimer)
    idleTimer = setTimeout(() => {
      void forceLogout()
    }, idleMs)
  }

  async function touchServer() {
    const now = Date.now()
    if (touchInFlight || now - lastTouchAt < touchMinIntervalMs) return
    touchInFlight = true
    try {
      await apiPost(touchPath)
      lastTouchAt = Date.now()
    } catch (err) {
      const status = err && typeof err === 'object' ? /** @type {{ status?: number }} */ (err).status : 0
      if (status === 401) goLogin()
    } finally {
      touchInFlight = false
    }
  }

  function onActivity() {
    if (leaving) return
    resetIdleTimer()
    void touchServer()
  }

  const events = ['pointerdown', 'keydown', 'scroll', 'touchstart']
  for (const name of events) {
    window.addEventListener(name, onActivity, { passive: true, capture: true })
  }
  document.addEventListener('visibilitychange', () => {
    if (document.visibilityState === 'visible') onActivity()
  })

  resetIdleTimer()
  void touchServer()

  return () => {
    if (idleTimer) clearTimeout(idleTimer)
    for (const name of events) {
      window.removeEventListener(name, onActivity, /** @type {any} */ ({ capture: true }))
    }
  }
}
