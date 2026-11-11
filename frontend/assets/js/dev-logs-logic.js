/** Pure helpers for the builder log viewer (no DOM). */

import { escapeHtml } from './html.js'

export const TOKEN_STORAGE_KEY = 'gym-dev-log-token'
export const LOG_FILES = ['access', 'app', 'error', 'sensitive']
export const DEFAULT_LIMIT = 400
export const REFRESH_MS = 8000

/**
 * @param {number} status
 * @returns {'off'|'unauthorized'|'ready'|'error'}
 */
export function viewerStateFromStatus(status) {
  if (status === 404) return 'off'
  if (status === 401 || status === 403) return 'unauthorized'
  if (status === 200) return 'ready'
  return 'error'
}

/**
 * @param {'off'|'unauthorized'|'ready'|'error'} state
 */
export function viewerMessage(state) {
  if (state === 'off') {
    return 'بیننده خاموش است — در .env مقدار DEV_LOG_VIEWER=true و یک DEV_LOG_VIEWER_TOKEN بلند (حداقل ۲۴ کاراکتر) بگذارید. روی سرور واقعی از فایل یا SSH استفاده کنید؛ این پنل در production خاموش است.'
  }
  if (state === 'unauthorized') {
    return 'توکن نادرست است. همان مقدار DEV_LOG_VIEWER_TOKEN را وارد کنید.'
  }
  if (state === 'error') return 'خواندن لاگ ناموفق بود.'
  return ''
}

/**
 * @param {{ file: string, offset?: number|null, limit?: number, q?: string, level?: string, rid?: string }} input
 */
export function buildReadParams(input) {
  /** @type {Record<string, string>} */
  const params = {
    file: input.file,
    limit: String(input.limit || DEFAULT_LIMIT),
  }
  if (input.offset != null && input.offset >= 0) params.offset = String(input.offset)
  const q = (input.q || '').trim()
  const level = (input.level || '').trim()
  const rid = (input.rid || '').trim()
  if (q) params.q = q
  if (level) params.level = level
  if (rid) params.rid = rid
  return params
}

/**
 * @param {number} offset
 * @param {number} limit
 */
export function olderOffset(offset, limit) {
  const step = Math.max(1, limit || DEFAULT_LIMIT)
  return Math.max(0, (offset || 0) - step)
}

/**
 * @param {string} text
 * @returns {string}
 */
export function lineLevel(text) {
  const match = String(text || '').match(/\b(DEBUG|INFO|WARNING|ERROR|CRITICAL)\b/)
  return match ? match[1] : ''
}

/**
 * @param {string} text
 * @returns {string[]}
 */
export function extractRequestIds(text) {
  const ids = []
  const re = /rid=([A-Za-z0-9._-]{6,80})/g
  let match = re.exec(String(text || ''))
  while (match) {
    if (!ids.includes(match[1])) ids.push(match[1])
    match = re.exec(String(text || ''))
  }
  return ids
}

const DETAIL_FIELDS = [
  'entity_type',
  'entity_id',
  'request_id',
  'actor_name',
  'actor_role',
  'method',
  'path',
  'status_code',
  'error_type',
  'summary',
]

/**
 * Detail JSON for every precise-activity row. Stored payload wins when it has keys.
 * @param {any} item
 * @returns {Record<string, unknown>}
 */
export function preciseDetail(item) {
  const stored = item?.payload
  if (
    stored &&
    typeof stored === 'object' &&
    !Array.isArray(stored) &&
    Object.keys(stored).length > 0
  ) {
    return stored
  }
  /** @type {Record<string, unknown>} */
  const detail = {
    action: item?.action || '',
    source: item?.source || '',
    category: item?.category || '',
    outcome: item?.outcome || '',
  }
  for (const key of DETAIL_FIELDS) {
    const value = item?.[key]
    if (value != null && value !== '') detail[key] = value
  }
  return detail
}

/**
 * @param {any} item
 */
export function precisePayloadMarkup(item) {
  const json = JSON.stringify(preciseDetail(item), null, 2)
  return `<pre class="dev-precise-payload">${escapeHtml(json)}</pre>`
}

/**
 * @param {{ offset: number, lines: {line:number}[], total_matched: number }} page
 */
export function isTailPage(page) {
  if (!page) return true
  const count = page.lines?.length || 0
  return page.offset + count >= (page.total_matched || 0)
}
