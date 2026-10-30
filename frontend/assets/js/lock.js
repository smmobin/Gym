import { ApiError, apiErrorMessage, apiGet, apiPost } from './api.js'
import { formatDateTime } from './format.js'

/** Default poll while a member is selected (other desks learn unlock/lock without refresh). */
export const MEMBER_LOCK_POLL_MS = 2500
export const MEMBER_LOCK_TOUCH_MS = 60_000

/** @param {unknown} detail */
export function formatMemberLockConflict(detail) {
  if (!detail || typeof detail !== 'object' || Array.isArray(detail)) return null
  const d = /** @type {Record<string, unknown>} */ (detail)
  if (d.code !== 'member_file_locked' && !d.locked_by_name && !d.expires_at) {
    if (typeof d.message === 'string' && d.message.includes('پرونده')) return d.message
    return null
  }
  const name = /** @type {string} */ (d.locked_by_name ?? 'کاربر دیگر')
  const mobile = d.locked_by_mobile ? ` (${d.locked_by_mobile})` : ''
  let expires = ''
  if (d.expires_at) {
    expires = ` — انقضا: ${formatDateTime(/** @type {string} */ (d.expires_at))}`
  }
  if (typeof d.message === 'string' && d.message.trim()) {
    return `${d.message}${expires && !d.message.includes('انقضا') ? expires : ''}`
  }
  return `پرونده الان در اختیار ${name}${mobile} است${expires}.`
}

/** @param {unknown} err @param {string} fallback */
export function lockErrorMessage(err, fallback) {
  if (err instanceof ApiError) {
    const fromDetail = formatMemberLockConflict(err.detail)
    if (fromDetail) return fromDetail
    return err.message || fallback
  }
  if (err && typeof err === 'object' && /** @type {{ name?: string }} */ (err).name === 'ApiError') {
    const fromDetail = formatMemberLockConflict(/** @type {{ detail?: unknown }} */ (err).detail)
    if (fromDetail) return fromDetail
  }
  return apiErrorMessage(err, fallback)
}

/**
 * Soft file lock — acquire / touch / release + poll while selected.
 * Server hands unlocked files to the *last* waiting selector (not a race).
 * @param {(status: object | null, error: string | null) => void} onChange
 * @param {{ pollMs?: number, touchMs?: number }} [opts]
 */
export function createMemberLock(onChange, opts = {}) {
  const pollMs = opts.pollMs ?? MEMBER_LOCK_POLL_MS
  const touchMs = opts.touchMs ?? MEMBER_LOCK_TOUCH_MS

  /** @type {number | null} */
  let watchedId = null
  /** @type {number | null} */
  let heldId = null
  /** @type {ReturnType<typeof setInterval> | null} */
  let pollTimer = null
  /** @type {ReturnType<typeof setInterval> | null} */
  let touchTimer = null
  let busy = false

  function stopPoll() {
    if (pollTimer) {
      clearInterval(pollTimer)
      pollTimer = null
    }
  }

  function stopTouch() {
    if (touchTimer) {
      clearInterval(touchTimer)
      touchTimer = null
    }
  }

  function startPoll() {
    stopPoll()
    if (watchedId == null) return
    pollTimer = setInterval(() => {
      void syncFromServer()
    }, pollMs)
  }

  function ensureTouch() {
    stopTouch()
    if (heldId == null) return
    touchTimer = setInterval(() => {
      if (heldId == null) return
      const id = heldId
      void apiPost(`/api/v1/members/${id}/lock/touch`).catch(async () => {
        try {
          const status = await apiGet(`/api/v1/members/${id}/lock`)
          if (watchedId !== id) return
          if (!status.held_by_me) {
            heldId = null
            stopTouch()
            onChange(
              status,
              status.locked ? formatMemberLockConflict(status) || 'پرونده قفل است.' : null,
            )
          } else {
            onChange(status, null)
          }
        } catch {
          /* ignore */
        }
      })
    }, touchMs)
  }

  /**
   * @param {number} id
   */
  async function tryAcquire(id) {
    if (busy) return
    busy = true
    try {
      const data = await apiPost(`/api/v1/members/${id}/lock`)
      if (watchedId !== id) {
        if (data.held_by_me) {
          await apiPost(`/api/v1/members/${id}/unlock`).catch(() => undefined)
        }
        return
      }
      if (!data.held_by_me && data.locked) {
        heldId = null
        stopTouch()
        onChange(data, formatMemberLockConflict(data) || 'پرونده قفل است.')
        return
      }
      heldId = id
      onChange(data, null)
      ensureTouch()
    } catch (err) {
      const msg = lockErrorMessage(err, 'قفل پرونده گرفته نشد.')
      try {
        const status = await apiGet(`/api/v1/members/${id}/lock`)
        if (watchedId !== id) return
        heldId = status.held_by_me ? id : null
        if (heldId) ensureTouch()
        else stopTouch()
        onChange(status, status.held_by_me ? null : msg)
      } catch {
        if (watchedId === id) onChange(null, msg)
        heldId = null
        stopTouch()
      }
    } finally {
      busy = false
    }
  }

  async function syncFromServer() {
    if (watchedId == null || busy) return
    const id = watchedId
    try {
      const status = await apiGet(`/api/v1/members/${id}/lock`)
      if (watchedId !== id) return

      if (status.held_by_me) {
        heldId = id
        onChange(status, null)
        ensureTouch()
        return
      }

      heldId = null
      stopTouch()

      if (status.locked) {
        onChange(status, formatMemberLockConflict(status) || 'پرونده قفل است.')
        return
      }

      onChange(status, 'در حال گرفتن قفل…')
      await tryAcquire(id)
    } catch {
      /* next poll retries */
    }
  }

  async function release() {
    const id = heldId ?? watchedId
    stopTouch()
    heldId = null
    if (id == null) {
      onChange(null, null)
      return
    }
    try {
      const data = await apiPost(`/api/v1/members/${id}/unlock`)
      if (watchedId == null) watchedId = id
      if (watchedId !== id) return
      if (data.held_by_me) {
        heldId = id
        onChange(data, null)
        ensureTouch()
        startPoll()
        return
      }
      if (data.locked) {
        onChange(data, formatMemberLockConflict(data) || 'پرونده قفل است.')
        startPoll()
        return
      }
      onChange(data, 'قفل آزاد شد.')
      startPoll()
      await tryAcquire(id)
    } catch {
      try {
        const status = await apiGet(`/api/v1/members/${id}/lock`)
        if (watchedId === id) {
          heldId = status.held_by_me ? id : null
          onChange(
            status,
            status.held_by_me
              ? null
              : status.locked
                ? formatMemberLockConflict(status)
                : 'قفل آزاد شد.',
          )
          if (heldId) ensureTouch()
          startPoll()
          if (!status.locked && !status.held_by_me) await tryAcquire(id)
        }
      } catch {
        onChange(null, null)
      }
    }
  }

  /**
   * @param {number | null} id
   */
  async function setMember(id) {
    if (id != null && watchedId === id && heldId === id) return

    if (heldId != null && heldId !== id) {
      const prev = heldId
      heldId = null
      stopTouch()
      try {
        await apiPost(`/api/v1/members/${prev}/unlock`)
      } catch {
        /* ignore */
      }
    }

    watchedId = id
    stopPoll()

    if (id == null) {
      stopTouch()
      heldId = null
      onChange(null, null)
      return
    }

    await tryAcquire(id)
    startPoll()
  }

  return {
    setMember,
    release,
    /** @internal test helper */
    syncNow: syncFromServer,
    get busy() {
      return busy
    },
    get memberId() {
      return heldId
    },
    get watchedId() {
      return watchedId
    },
  }
}
