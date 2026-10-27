/**
 * Client-side list pagination (5 rows per page) for Ocean Dark panels.
 *
 * Live + mutation contract (reuse across panels — BUG-008):
 * 1. After create/update, `emitLive(LIVE.*)` so other mounts refresh.
 * 2. Pass `{ focusId }` (or call `pager.goToMatching`) so the pager lands on
 *    the page that contains the mutated row — do not only `reset()` to page 1.
 * 3. `load` must assign fresh `items` then `paint` (or `goToMatching`) so the
 *    tbody is rewritten from the latest API payload.
 */

export const LIST_PAGE_SIZE = 5

/**
 * @param {number} n
 */
export function faNum(n) {
  return Number(n).toLocaleString('fa-IR')
}

/**
 * 1-based page that contains a 0-based index.
 * @param {number} index
 * @param {number} [pageSize]
 */
export function pageForIndex(index, pageSize = LIST_PAGE_SIZE) {
  if (index < 0) return 1
  return Math.floor(index / pageSize) + 1
}

/**
 * Page containing the first item matching `predicate`, or null if none.
 * @template T
 * @param {T[]} items
 * @param {(item: T) => boolean} predicate
 * @param {number} [pageSize]
 * @returns {number | null}
 */
export function findItemPage(items, predicate, pageSize = LIST_PAGE_SIZE) {
  const list = Array.isArray(items) ? items : []
  const idx = list.findIndex(predicate)
  if (idx < 0) return null
  return pageForIndex(idx, pageSize)
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
     * @param {number} next 1-based
     */
    setPage(next) {
      page = Math.max(1, Number(next) || 1)
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
    /**
     * Jump to the page that contains the first matching row, then paint.
     * @template T
     * @param {T[]} all
     * @param {(rows: T[]) => void} paint
     * @param {(item: T) => boolean} predicate
     * @returns {number | null} focused page, or null if not found
     */
    goToMatching(all, paint, predicate) {
      const target = findItemPage(all, predicate, pageSize)
      if (target != null) page = target
      this.paint(all, paint)
      return target
    },
  }
}
