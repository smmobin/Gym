import { ApiError, apiGet } from './api.js'
import { escapeHtml } from './html.js'
import { slicePage } from './pagination.js'

/** Landing shows three quotes per page (matches desktop 3-column grid). */
export const TESTIMONIALS_PAGE_SIZE = 3

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
      return `<blockquote data-testimonial-id="${escapeHtml(row.id)}">
          <p>${escapeHtml(formatQuoteBody(row.body))}</p>
          <cite>${escapeHtml(formatCite(row))}</cite>
        </blockquote>`
    })
    .join('')
}

/**
 * @param {{ page: number, totalPages: number, total: number }} state
 */
export function renderTestimonialsPager(state) {
  const { page, totalPages, total } = state
  if (totalPages <= 1 || total <= TESTIMONIALS_PAGE_SIZE) {
    return ''
  }
  const pageFa = page.toLocaleString('fa-IR')
  const pagesFa = totalPages.toLocaleString('fa-IR')
  const prevDisabled = page <= 1 ? ' disabled' : ''
  const nextDisabled = page >= totalPages ? ' disabled' : ''
  return `<nav class="testimonials-pager" data-testimonials-pager aria-label="صفحه‌بندی نظرات">
      <button type="button" class="btn ghost small" data-testimonials-prev${prevDisabled}>قبلی</button>
      <span class="testimonials-pager-status" data-testimonials-page-label>صفحه ${pageFa} از ${pagesFa}</span>
      <button type="button" class="btn small" data-testimonials-next${nextDisabled}>۳ نظر بعدی</button>
    </nav>`
}

/**
 * @param {HTMLElement} grid
 * @param {HTMLElement | null} pagerHost
 * @param {PublicTestimonial[]} items
 * @param {number} page
 * @param {(nextPage: number) => void} onPage
 */
export function paintTestimonialsPage(grid, pagerHost, items, page, onPage) {
  const sliced = slicePage(items, page, TESTIMONIALS_PAGE_SIZE)
  grid.innerHTML = renderPublicTestimonialCards(sliced.items)
  if (!pagerHost) return
  pagerHost.innerHTML = renderTestimonialsPager({
    page: sliced.page,
    totalPages: sliced.totalPages,
    total: sliced.total,
  })
  pagerHost.hidden = sliced.totalPages <= 1
  pagerHost.querySelector('[data-testimonials-prev]')?.addEventListener('click', () => {
    if (sliced.page > 1) onPage(sliced.page - 1)
  })
  pagerHost.querySelector('[data-testimonials-next]')?.addEventListener('click', () => {
    if (sliced.page < sliced.totalPages) onPage(sliced.page + 1)
  })
}

/**
 * Fill landing testimonials grid from the public API (3 per page).
 * @param {HTMLElement} grid
 * @param {HTMLElement | null} [statusEl]
 * @param {{
 *   fetchTestimonials?: () => Promise<{ items: PublicTestimonial[] }>,
 *   pagerHost?: HTMLElement | null,
 * }} [opts]
 */
export async function mountPublicTestimonials(grid, statusEl = null, opts = {}) {
  const fetchTestimonials =
    opts.fetchTestimonials ||
    (async () => {
      const data = await apiGet('/api/v1/public/testimonials')
      return { items: Array.isArray(data?.items) ? data.items : [] }
    })

  const pagerHost =
    opts.pagerHost ??
    /** @type {HTMLElement | null} */ (
      grid.parentElement?.querySelector('[data-testimonials-pager-host]')
    )

  grid.setAttribute('aria-busy', 'true')
  grid.innerHTML = `<p class="hint" data-testimonials-loading>در حال بارگذاری نظرات…</p>`
  if (pagerHost) {
    pagerHost.hidden = true
    pagerHost.innerHTML = ''
  }
  if (statusEl) {
    statusEl.hidden = true
    statusEl.textContent = ''
    statusEl.className = 'testimonials-status hint'
  }

  try {
    const data = await fetchTestimonials()
    const items = Array.isArray(data?.items) ? data.items : []
    /** @type {number} */
    let page = 1
    const paint = () => {
      paintTestimonialsPage(grid, pagerHost, items, page, (next) => {
        page = next
        paint()
      })
    }
    paint()
    grid.removeAttribute('aria-busy')
  } catch (err) {
    grid.innerHTML = ''
    grid.removeAttribute('aria-busy')
    if (pagerHost) {
      pagerHost.hidden = true
      pagerHost.innerHTML = ''
    }
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
