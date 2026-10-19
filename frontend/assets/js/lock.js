import { ApiError, apiGet, apiPost } from './api.js'
import { formatDateTime } from './format.js'

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
    return err.message
  }
  return fallback
}

/**
 * Soft file lock for a member — acquire / touch / release.
 * @param {(status: object | null, error: string | null) => void} onChange
 */
export function createMemberLock(onChange) {
  /** @type {number | null} */
  let memberId = null
  /** @type {ReturnType<typeof setInterval> | null} */
  let timer = null
  let busy = false

  async function release() {
    if (memberId == null) return
    const id = memberId
    memberId = null
    if (timer) {
      clearInterval(timer)
      timer = null
    }
    try {
      await apiPost(`/api/v1/members/${id}/unlock`)
    } catch {
      // ignore
    }
    onChange(null, null)
  }

  /**
   * @param {number | null} id
   */
  async function setMember(id) {
    if (memberId === id) return
    if (memberId != null) await release()
    if (id == null) {
      onChange(null, null)
      return
    }
    memberId = id
    busy = true
    try {
      const data = await apiPost(`/api/v1/members/${id}/lock`)
      if (!data.held_by_me && data.locked) {
        await apiPost(`/api/v1/members/${id}/unlock`).catch(() => undefined)
        onChange(data, formatMemberLockConflict(data) || 'پرونده قفل است.')
        memberId = null
        return
      }
      onChange(data, null)
      timer = setInterval(() => {
        if (memberId == null) return
        void apiPost(`/api/v1/members/${memberId}/lock/touch`).catch(async () => {
          try {
            const status = await apiGet(`/api/v1/members/${id}/lock`)
            onChange(status, status.held_by_me ? null : formatMemberLockConflict(status))
          } catch {
            // ignore
          }
        })
      }, 60_000)
    } catch (err) {
      const msg = lockErrorMessage(err, 'قفل پرونده گرفته نشد.')
      try {
        const status = await apiGet(`/api/v1/members/${id}/lock`)
        onChange(status, msg)
      } catch {
        onChange(null, msg)
      }
      memberId = null
    } finally {
      busy = false
    }
  }

  return {
    setMember,
    release,
    get busy() {
      return busy
    },
    get memberId() {
      return memberId
    },
  }
}
