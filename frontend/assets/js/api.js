/**
 * Shared fetch client — credentials include for httpOnly session cookies.
 * Base URL: import.meta.env.VITE_API_BASE_URL or '' (Vite proxy /api → :8000).
 */

const API_BASE = import.meta.env.VITE_API_BASE_URL ?? ''

export class ApiError extends Error {
  /** @param {number} status @param {string} message @param {unknown} [detail] */
  constructor(status, message, detail) {
    super(message)
    this.name = 'ApiError'
    this.status = status
    this.detail = detail
  }
}

/** @param {string} msg */
function isTechnicalClientMessage(msg) {
  return /is not a function|is not defined|Cannot read propert|Cannot set propert|null is not an object|undefined is not an object|Maximum call stack|Unexpected token|Failed to fetch|NetworkError|Load failed|network request failed/i.test(
    msg,
  )
}

/**
 * Reliable message for UI status lines.
 * Prefer this over `instanceof ApiError` alone — Vite can duplicate the module
 * and break instanceof across import graphs.
 * Never surface raw TypeError/network engine text (e.g. `apiPost(...) is not a function`).
 * @param {unknown} err
 * @param {string} fallback
 */
export function apiErrorMessage(err, fallback) {
  if (err instanceof ApiError) return err.message || fallback
  if (err && typeof err === 'object' && /** @type {{ name?: string, message?: string }} */ (err).name === 'ApiError') {
    const msg = /** @type {{ message?: string }} */ (err).message
    return msg || fallback
  }
  if (err instanceof Error && err.message) {
    if (
      err.name === 'TypeError' ||
      err.name === 'ReferenceError' ||
      isTechnicalClientMessage(err.message)
    ) {
      return fallback
    }
    return err.message
  }
  return fallback
}

/**
 * @param {string} path
 * @param {{ method?: string, body?: unknown }} [options]
 */
export async function apiRequest(path, options = {}) {
  const response = await fetch(`${API_BASE}${path}`, {
    method: options.method ?? 'GET',
    credentials: 'include',
    headers: options.body ? { 'Content-Type': 'application/json' } : undefined,
    body: options.body ? JSON.stringify(options.body) : undefined,
  })

  if (!response.ok) {
    let detail = `API ${response.status}: ${path}`
    let payload
    try {
      const data = await response.json()
      payload = data.detail
      if (typeof data.detail === 'string') {
        detail = data.detail
      } else if (
        data.detail &&
        typeof data.detail === 'object' &&
        !Array.isArray(data.detail) &&
        typeof data.detail.message === 'string'
      ) {
        detail = data.detail.message
      }
    } catch {
      // keep default
    }
    throw new ApiError(response.status, detail, payload)
  }

  if (response.status === 204) return undefined
  return response.json()
}

/** @param {string} path */
export function apiGet(path) {
  return apiRequest(path)
}

/** @param {string} path @param {unknown} [body] */
export function apiPost(path, body) {
  return apiRequest(path, { method: 'POST', body })
}

/** @param {string} path @param {unknown} [body] */
export function apiPatch(path, body) {
  return apiRequest(path, { method: 'PATCH', body })
}

export { API_BASE }
