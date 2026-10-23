/**
 * Cross-panel live updates (same tab). Emit after mutations so other mounts
 * refresh without a full page reload.
 */

export const LIVE = {
  PLANS: 'gym:live:plans',
  MEMBERS: 'gym:live:members',
  STAFF: 'gym:live:staff',
  LOCKERS: 'gym:live:lockers',
  EXPENSES: 'gym:live:expenses',
  BILLING: 'gym:live:billing',
  ATTENDANCE: 'gym:live:attendance',
  CLASSES: 'gym:live:classes',
  TRIAL: 'gym:live:trial',
}

/**
 * @param {string} name
 * @param {unknown} [detail]
 */
export function emitLive(name, detail) {
  if (typeof window === 'undefined') return
  window.dispatchEvent(new CustomEvent(name, { detail }))
}

/**
 * @param {string} name
 * @param {(ev: Event) => void} handler
 * @returns {() => void} unsubscribe
 */
export function onLive(name, handler) {
  if (typeof window === 'undefined') return () => {}
  window.addEventListener(name, handler)
  return () => window.removeEventListener(name, handler)
}
