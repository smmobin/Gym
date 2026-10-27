/**
 * Periodic list refresh with exponential backoff on failure.
 * Pauses while the tab or host `[data-section]` is hidden; retries on
 * `online` / becoming visible again.
 * Optional `events` (e.g. LIVE.PLANS) force an immediate refresh in this tab.
 *
 * Live detail (BUG-008): `emitLive(LIVE.*, { focusId })` and
 * `autoRefresh.refresh({ focusId })` forward extras into `loadFn` so panels
 * can `pager.goToMatching` after mutation without sticking on page 1.
 *
 * @param {HTMLElement} root
 * @param {(ctx: { silent: boolean } & Record<string, unknown>) => Promise<void>} loadFn reject/throw → retry
 * @param {{
 *   intervalMs?: number,
 *   retryBaseMs?: number,
 *   retryMaxMs?: number,
 *   events?: string[],
 * }} [opts]
 */
export function createAutoRefresh(root, loadFn, opts = {}) {
  const intervalMs = opts.intervalMs ?? 15_000
  const retryBaseMs = opts.retryBaseMs ?? 2_500
  const retryMaxMs = opts.retryMaxMs ?? 45_000
  const events = Array.isArray(opts.events) ? opts.events.filter(Boolean) : []

  let stopped = false
  /** @type {ReturnType<typeof setTimeout> | null} */
  let timer = null
  let inFlight = false
  /** When a forced refresh arrives during an in-flight load, run again after. */
  let pendingForce = false
  /** @type {Record<string, unknown>} */
  let pendingExtra = {}
  let consecutiveFailures = 0
  let everSucceeded = false
  /** @type {Array<() => void>} */
  const unsubs = []

  function clearTimer() {
    if (timer != null) {
      clearTimeout(timer)
      timer = null
    }
  }

  function sectionHidden() {
    const sec = root.closest('[data-section]')
    return !!(sec && sec.hasAttribute('hidden'))
  }

  function shouldRun() {
    return !stopped && document.visibilityState !== 'hidden' && !sectionHidden()
  }

  /** @param {number} ms */
  function schedule(ms) {
    clearTimer()
    if (stopped) return
    timer = setTimeout(() => {
      void run()
    }, ms)
  }

  function retryDelay() {
    const exp = retryBaseMs * 2 ** Math.max(0, consecutiveFailures - 1)
    return Math.min(retryMaxMs, exp)
  }

  /**
   * @param {boolean} [force]
   * @param {Record<string, unknown>} [extra]
   */
  async function run(force = false, extra = {}) {
    if (stopped) return
    if (inFlight) {
      if (force) {
        pendingForce = true
        pendingExtra = { ...pendingExtra, ...extra }
      }
      return
    }
    if (!force && !shouldRun()) {
      schedule(intervalMs)
      return
    }
    inFlight = true
    // Silent only for background polls — forced refresh (create/edit / online) stays loud.
    const silent = everSucceeded && !force
    const ctx = { silent, ...extra }
    try {
      await loadFn(ctx)
      consecutiveFailures = 0
      everSucceeded = true
      schedule(intervalMs)
    } catch {
      consecutiveFailures += 1
      schedule(retryDelay())
    } finally {
      inFlight = false
      if (pendingForce && !stopped) {
        pendingForce = false
        const nextExtra = pendingExtra
        pendingExtra = {}
        void run(true, nextExtra)
      }
    }
  }

  function onResume() {
    if (shouldRun()) void run(true)
  }

  function onOnline() {
    void run(true)
  }

  /** @param {Event} ev */
  function onLiveEvent(ev) {
    const detail =
      ev && typeof ev === 'object' && 'detail' in ev && ev.detail && typeof ev.detail === 'object'
        ? /** @type {Record<string, unknown>} */ (ev.detail)
        : {}
    void run(true, detail)
  }

  document.addEventListener('visibilitychange', onResume)
  window.addEventListener('online', onOnline)
  window.addEventListener('hashchange', onResume)
  for (const name of events) {
    window.addEventListener(name, onLiveEvent)
    unsubs.push(() => window.removeEventListener(name, onLiveEvent))
  }

  void run(true)

  return {
    /**
     * Force an immediate refresh (e.g. after create/edit).
     * @param {Record<string, unknown>} [extra] forwarded to loadFn (e.g. `{ focusId }`)
     */
    refresh: (extra = {}) => run(true, extra),
    stop() {
      stopped = true
      clearTimer()
      document.removeEventListener('visibilitychange', onResume)
      window.removeEventListener('online', onOnline)
      window.removeEventListener('hashchange', onResume)
      while (unsubs.length) {
        const off = unsubs.pop()
        if (off) off()
      }
    },
  }
}
