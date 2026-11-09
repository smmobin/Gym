/**
 * Register the generated service worker (production / preview).
 * Auto-update: when a new SW is waiting, activate and soft-reload once.
 * Never touches /api caching — that is enforced in workbox config.
 */
import { registerSW } from 'virtual:pwa-register'

const updateSW = registerSW({
  immediate: true,
  onRegisteredSW(_swUrl, registration) {
    if (!registration) return
    // Periodic check so long-lived panels pick up shell updates.
    setInterval(() => {
      registration.update().catch(() => {})
    }, 60 * 60 * 1000)
  },
  onNeedRefresh() {
    // autoUpdate + skipWaiting: apply shell update without a blocking modal.
    updateSW(true).catch(() => {})
  },
  onOfflineReady() {
    // Shell assets may be cached; API remains network-only.
  },
})
