/**
 * Periodic list refresh with exponential backoff on failure.
 * Pauses while the tab or host `[data-section]` is hidden; retries on
 * `online` / becoming visible again.
 *
 * @param {HTMLElement} root
 * @param {(ctx: { silent: boolean }) => Promise<void>} loadFn reject/throw → retry
 * @param {{ intervalMs?: number, retryBaseMs?: number, retryMaxMs?: number }} [opts]
 */
export function createAutoRefresh(root, loadFn, opts = {}) {
  const intervalMs = opts.intervalMs ?? 30_000
  const retryBaseMs = opts.retryBaseMs ?? 2_500
  const retryMaxMs = opts.retryMaxMs ?? 45_000

  let stopped = false
  /** @type {ReturnType<typeof setTimeout> | null} */
  let timer = null
  let inFlight = false
  /** When a forced refresh arrives during an in-flight load, run again after. */
  let pendingForce = false
  let consecutiveFailures = 0
  let everSucceeded = false

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
   */
  async function run(force = false) {
    if (stopped) return
    if (inFlight) {
      if (force) pendingForce = true
      return
    }
    if (!force && !shouldRun()) {
      schedule(intervalMs)
      return
    }
    inFlight = true
    // Silent only for background polls — forced refresh (create/edit / online) stays loud.
    const silent = everSucceeded && !force
    try {
      await loadFn({ silent })
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
        void run(true)
      }
    }
  }

  function onResume() {
    if (shouldRun()) void run(true)
  }

  function onOnline() {
    void run(true)
  }

  document.addEventListener('visibilitychange', onResume)
  window.addEventListener('online', onOnline)
  window.addEventListener('hashchange', onResume)

  void run(true)

  return {
    /** Force an immediate refresh (e.g. after create/edit). */
    refresh: () => run(true),
    stop() {
      stopped = true
      clearTimer()
      document.removeEventListener('visibilitychange', onResume)
      window.removeEventListener('online', onOnline)
      window.removeEventListener('hashchange', onResume)
    },
  }
}
