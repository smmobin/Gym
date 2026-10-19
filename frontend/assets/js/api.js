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
