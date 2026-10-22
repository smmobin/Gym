/**
 * Client-side list pagination (5 rows per page) for Ocean Dark panels.
 */

export const LIST_PAGE_SIZE = 5

/**
 * @param {number} n
 */
export function faNum(n) {
  return Number(n).toLocaleString('fa-IR')
}

/**
 * @template T
 * @param {T[]} items
 * @param {number} page 1-based
 * @param {number} [pageSize]
 */
export function slicePage(items, page, pageSize = LIST_PAGE_SIZE) {
  const list = Array.isArray(items) ? items : []
  const total = list.length
  const totalPages = Math.max(1, Math.ceil(total / pageSize) || 1)
  const safePage = Math.min(Math.max(1, page || 1), totalPages)
  const start = (safePage - 1) * pageSize
  return {
    page: safePage,
    totalPages,
    total,
    pageSize,
    items: list.slice(start, start + pageSize),
  }
}

/**
 * Renders prev / page status / next. Hidden when total === 0.
 * @param {HTMLElement | null} el
 * @param {{ page: number, totalPages: number, total: number, onChange: (page: number) => void }} opts
 */
export function renderListPager(el, opts) {
  if (!el) return
  const { page, totalPages, total, onChange } = opts
  if (!total) {
    el.innerHTML = ''
    el.hidden = true
    return
  }
  el.hidden = false
  el.innerHTML = `
    <nav class="list-pager" aria-label="صفحه‌بندی فهرست">
      <button type="button" class="btn ghost small list-pager-btn" data-pager="prev" ${
        page <= 1 ? 'disabled' : ''
      } aria-label="صفحه قبل">قبلی</button>
      <span class="list-pager-status" aria-live="polite">صفحه ${faNum(page)} از ${faNum(totalPages)}</span>
      <button type="button" class="btn ghost small list-pager-btn" data-pager="next" ${
        page >= totalPages ? 'disabled' : ''
      } aria-label="صفحه بعد">بعدی</button>
    </nav>
  `
  el.querySelector('[data-pager="prev"]')?.addEventListener('click', () => {
    if (page > 1) onChange(page - 1)
  })
  el.querySelector('[data-pager="next"]')?.addEventListener('click', () => {
    if (page < totalPages) onChange(page + 1)
  })
}

/**
 * Stateful helper for a panel list.
 * @param {HTMLElement | null} pagerEl
 * @param {{ pageSize?: number }} [options]
 */
export function createListPager(pagerEl, options = {}) {
  const pageSize = options.pageSize ?? LIST_PAGE_SIZE
  let page = 1

  return {
    get page() {
      return page
    },
    reset() {
      page = 1
    },
    /**
     * @template T
     * @param {T[]} all
     * @param {(rows: T[]) => void} paint
     */
    paint(all, paint) {
      const sliced = slicePage(all, page, pageSize)
      page = sliced.page
      paint(sliced.items)
      renderListPager(pagerEl, {
        page: sliced.page,
        totalPages: sliced.totalPages,
        total: sliced.total,
        onChange: (next) => {
          page = next
          this.paint(all, paint)
        },
      })
    },
  }
}
