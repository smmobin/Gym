import { ApiError, apiGet } from './api.js'

/** @param {string} value */
function escapeHtml(value) {
  return String(value)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
}

/**
 * @typedef {{
 *   id: number,
 *   body: string,
 *   author_name: string,
 *   author_meta?: string | null,
 *   sort_order?: number,
 * }} PublicTestimonial
 */

/**
 * Wrap quote body with Persian guillemets if missing.
 * @param {string} body
 */
export function formatQuoteBody(body) {
  const t = String(body || '').trim()
  if (!t) return ''
  if (t.startsWith('«') || t.startsWith('"') || t.startsWith('“')) return t
  return `«${t}»`
}

/**
 * @param {PublicTestimonial} row
 */
export function formatCite(row) {
  const name = String(row.author_name || '').trim() || '—'
  const meta = String(row.author_meta || '').trim()
  return meta ? `${name} · ${meta}` : name
}

/**
 * @param {PublicTestimonial[]} items
 */
export function renderPublicTestimonialCards(items) {
  if (!items.length) {
    return `<p class="hint" data-testimonials-empty>فعلاً نظری برای نمایش نیست.</p>`
  }
  return items
    .map((row) => {
      return `<blockquote data-testimonial-id="${row.id}">
          <p>${escapeHtml(formatQuoteBody(row.body))}</p>
          <cite>${escapeHtml(formatCite(row))}</cite>
        </blockquote>`
    })
    .join('')
}

/**
 * Fill landing testimonials grid from the public API.
 * @param {HTMLElement} grid
 * @param {HTMLElement | null} [statusEl]
 * @param {{ fetchTestimonials?: () => Promise<{ items: PublicTestimonial[] }> }} [opts]
 */
export async function mountPublicTestimonials(grid, statusEl = null, opts = {}) {
  const fetchTestimonials =
    opts.fetchTestimonials ||
    (async () => {
      const data = await apiGet('/api/v1/public/testimonials')
      return { items: Array.isArray(data?.items) ? data.items : [] }
    })

  grid.setAttribute('aria-busy', 'true')
  grid.innerHTML = `<p class="hint" data-testimonials-loading>در حال بارگذاری نظرات…</p>`
  if (statusEl) {
    statusEl.hidden = true
    statusEl.textContent = ''
    statusEl.className = 'testimonials-status hint'
  }

  try {
    const data = await fetchTestimonials()
    const items = Array.isArray(data?.items) ? data.items : []
    grid.innerHTML = renderPublicTestimonialCards(items)
    grid.removeAttribute('aria-busy')
  } catch (err) {
    grid.innerHTML = ''
    grid.removeAttribute('aria-busy')
    const msg =
      err instanceof ApiError
        ? err.message
        : 'فعلاً نظرات در دسترس نیست.'
    if (statusEl) {
      statusEl.hidden = false
      statusEl.className = 'testimonials-status status-msg error'
      statusEl.textContent = msg
    } else {
      grid.innerHTML = `<p class="status-msg error" data-testimonials-error>${escapeHtml(msg)}</p>`
    }
  }
}
