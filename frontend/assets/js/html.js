const HTML_ESCAPES = {
  '&': '&amp;',
  '<': '&lt;',
  '>': '&gt;',
  '"': '&quot;',
  "'": '&#39;',
  '`': '&#96;',
}

/**
 * Escape a value for safe interpolation into HTML text or a quoted attribute.
 * @param {unknown} value
 * @returns {string}
 */
export function escapeHtml(value) {
  if (value === null || value === undefined) return ''
  return String(value).replace(/[&<>"'`]/g, (ch) => HTML_ESCAPES[ch])
}

export const escapeAttr = escapeHtml

/**
 * Allow only http(s) URLs (absolute or relative to the current origin) for navigation.
 * @param {unknown} value
 * @param {string} [base]
 * @returns {string | null}
 */
export function safeHttpUrl(value, base) {
  if (typeof value !== 'string' || !value.trim()) return null
  try {
    const fallback = base || (typeof location !== 'undefined' ? location.href : 'http://localhost/')
    const url = new URL(value.trim(), fallback)
    if (url.protocol !== 'http:' && url.protocol !== 'https:') return null
    return url.href
  } catch {
    return null
  }
}
