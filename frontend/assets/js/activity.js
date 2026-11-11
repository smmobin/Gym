/**
 * Manager «فعالیت سامانه» — readable subset of server audit + error summaries.
 * Data: GET /api/v1/manager/activity · Export: GET /api/v1/manager/activity/export (.log).
 * Never shows raw backend log files; the server already redacts summaries.
 */
import { API_BASE, ApiError, apiErrorMessage, apiGet } from './api.js'
import { createAutoRefresh } from './auto-refresh.js'
import { formatDateTime, formatJalaliDate, isoDateLocal, ROLE_LABEL } from './format.js'
import { escapeHtml } from './html.js'
import { bindLiveSearch } from './live-search.js'
import { createListPager } from './pagination.js'
import { setStatus } from './ui.js'

export const ACTIVITY_PAGE_SIZE = 10
export const ACTIVITY_DEFAULT_DAYS = 7

export const ACTIVITY_CATEGORY_LABEL = {
  auth: 'ورود/خروج',
  plans: 'طرح و قیمت',
  memberships: 'عضویت',
  payments: 'پرداخت',
  settings: 'تنظیمات',
  staff: 'کارکنان',
  errors: 'خطای سرور',
}

/** @param {string | null | undefined} cat */
export function activityCategoryLabel(cat) {
  if (!cat) return '—'
  return ACTIVITY_CATEGORY_LABEL[/** @type {keyof typeof ACTIVITY_CATEGORY_LABEL} */ (cat)] ?? cat
}

/**
 * Default range: last N days ending today (local / Tehran wall clock).
 * @param {Date} [now]
 */
export function defaultActivityRange(now = new Date()) {
  const start = new Date(now.getFullYear(), now.getMonth(), now.getDate() - (ACTIVITY_DEFAULT_DAYS - 1))
  return { from: isoDateLocal(start), to: isoDateLocal(now) }
}

/**
 * @param {{ from?: string, to?: string, q?: string, category?: string, cursor?: string | null }} f
 * @returns {URLSearchParams}
 */
export function buildActivityQuery(f) {
  const params = new URLSearchParams()
  if (f.from) params.set('from', f.from)
  if (f.to) params.set('to', f.to)
  const q = (f.q || '').trim()
  if (q) params.set('q', q)
  if (f.category) params.set('category', f.category)
  if (f.cursor) params.set('cursor', f.cursor)
  return params
}

/**
 * @param {string | null | undefined} header
 * @returns {string | null}
 */
export function filenameFromDisposition(header) {
  const match = /filename="?([^";]+)"?/i.exec(header || '')
  return match ? match[1] : null
}

/** @param {{ from: string, to: string }} range */
export function fallbackExportFilename(range) {
  const compact = (iso) => String(iso || '').replace(/-/g, '')
  return `gym-activity-${compact(range.from)}-${compact(range.to)}.log`
}

/** @param {any} item */
function actorLine(item) {
  const name = item.actor_name || ''
  const role = item.actor_role ? ROLE_LABEL[item.actor_role] || item.actor_role : ''
  if (name && role) return `${name} · ${role}`
  return name || role || ''
}

/**
 * @param {any[]} items
 * @returns {string}
 */
export function buildActivityRowsHtml(items) {
  if (!items.length) {
    return '<p class="hint activity-empty">در این بازه رویدادی ثبت نشده است.</p>'
  }
  return items
    .map((item) => {
      const fail = item.outcome === 'fail'
      const isError = item.source === 'error'
      const meta = []
      const actor = actorLine(item)
      if (actor) meta.push(escapeHtml(actor))
      if (isError && item.path) {
        meta.push(
          `<span class="activity-path en" dir="ltr">${escapeHtml(`${item.method || ''} ${item.path} → ${item.status_code ?? ''}`.trim())}</span>`,
        )
      }
      const rid = item.request_id
        ? `<code class="activity-rid en" dir="ltr" title="${escapeHtml(item.request_id)}">${escapeHtml(String(item.request_id).slice(0, 8))}</code>`
        : ''
      return `<article class="activity-row${fail ? ' is-fail' : ''}${isError ? ' is-error' : ''}" data-activity-id="${escapeHtml(item.id)}">
        <span class="activity-dot" aria-hidden="true"></span>
        <div class="activity-main">
          <p class="activity-summary">${escapeHtml(item.summary)}</p>
          <p class="activity-meta hint">${meta.join(' · ')}${rid ? `${meta.length ? ' · ' : ''}${rid}` : ''}</p>
        </div>
        <div class="activity-side">
          <time class="activity-time" datetime="${escapeHtml(item.created_at)}">${escapeHtml(formatDateTime(item.created_at))}</time>
          <span class="activity-badges">
            <span class="badge">${escapeHtml(activityCategoryLabel(item.category))}</span>
            <span class="badge ${fail ? 'danger' : 'ok'}">${fail ? 'ناموفق' : 'موفق'}</span>
          </span>
        </div>
      </article>`
    })
    .join('')
}

/**
 * @param {Record<string, number>} counts
 * @param {number} total
 */
export function buildActivityStatsHtml(counts, total) {
  const fails = counts.fail || 0
  const errors = counts.errors || 0
  return `
    <span class="activity-stat"><strong>${total.toLocaleString('fa-IR')}</strong> رویداد</span>
    <span class="activity-stat ${fails ? 'warn' : ''}"><strong>${fails.toLocaleString('fa-IR')}</strong> ناموفق</span>
    <span class="activity-stat ${errors ? 'danger' : ''}"><strong>${errors.toLocaleString('fa-IR')}</strong> خطای سرور</span>
  `
}

/** @param {any[]} items */
export function countActivity(items) {
  const counts = { fail: 0, errors: 0 }
  for (const item of items) {
    if (item.outcome === 'fail') counts.fail += 1
    if (item.source === 'error') counts.errors += 1
  }
  return counts
}

/**
 * @param {URLSearchParams} params
 * @param {{ from: string, to: string }} range
 */
async function downloadActivityLog(params, range) {
  const response = await fetch(`${API_BASE}/api/v1/manager/activity/export?${params}`, {
    credentials: 'include',
  })
  if (!response.ok) {
    let detail = 'خروجی گرفته نشد.'
    try {
      const data = await response.json()
      if (typeof data.detail === 'string') detail = data.detail
    } catch {
      /* keep default */
    }
    throw new ApiError(response.status, detail)
  }
  const blob = await response.blob()
  const name =
    filenameFromDisposition(response.headers.get('content-disposition')) ||
    fallbackExportFilename(range)
  const url = URL.createObjectURL(blob)
  const a = document.createElement('a')
  a.href = url
  a.download = name
  document.body.appendChild(a)
  a.click()
  a.remove()
  setTimeout(() => URL.revokeObjectURL(url), 1000)
}

/** @param {HTMLElement} root @param {{ role: string }} user */
export function mountActivity(root, user) {
  if (user.role !== 'manager') {
    root.innerHTML =
      '<p class="status-msg error">فعالیت سامانه فقط برای مدیر است. سرور هم ۴۰۳ می‌دهد.</p>'
    return
  }
  const range = defaultActivityRange()
  const chips = ['', ...Object.keys(ACTIVITY_CATEGORY_LABEL)]
  root.innerHTML = `
    <article class="panel activity-panel">
      <header class="panel-head">
        <div>
          <h2>فعالیت سامانه</h2>
          <p class="hint">ورود/خروج، تغییر قیمت و طرح، عضویت، پرداخت، تنظیمات، کارکنان و خطاهای مهم سرور.</p>
        </div>
        <button type="button" class="btn ghost small" data-activity-export>خروجی بازه (.log)</button>
      </header>
      <form data-activity-range class="form-grid activity-filters">
        <label>از<input type="date" name="from" value="${range.from}" /></label>
        <label>تا<input type="date" name="to" value="${range.to}" /></label>
        <label class="activity-search">جستجو
          <input type="search" name="q" maxlength="80" placeholder="نام، رویداد، شناسهٔ درخواست…" autocomplete="off" />
        </label>
        <button class="btn" type="submit">اعمال بازه</button>
      </form>
      <div class="activity-chips" role="group" aria-label="دستهٔ فعالیت">
        ${chips
          .map(
            (cat) =>
              `<button type="button" class="activity-chip${cat ? '' : ' is-active'}" data-cat="${cat}" aria-pressed="${cat ? 'false' : 'true'}">${cat ? activityCategoryLabel(cat) : 'همه'}</button>`,
          )
          .join('')}
      </div>
      <div class="activity-stats" data-activity-stats></div>
      <div class="status-msg" data-status hidden></div>
      <div class="activity-list" data-activity-list></div>
      <div data-activity-pager class="list-pager-host" hidden></div>
      <div class="inline-actions activity-more" data-activity-more hidden>
        <button type="button" class="btn ghost small" data-activity-older>رویدادهای قدیمی‌تر</button>
      </div>
      <p class="hint activity-foot">لاگ کامل فنی فقط روی سرور است و از وب در دسترس نیست. زمان‌ها به وقت تهران.</p>
    </article>
  `

  const status = /** @type {HTMLElement | null} */ (root.querySelector('[data-status]'))
  const form = /** @type {HTMLFormElement} */ (root.querySelector('[data-activity-range]'))
  const listEl = /** @type {HTMLElement} */ (root.querySelector('[data-activity-list]'))
  const statsEl = /** @type {HTMLElement} */ (root.querySelector('[data-activity-stats]'))
  const moreEl = /** @type {HTMLElement} */ (root.querySelector('[data-activity-more]'))
  const pager = createListPager(root.querySelector('[data-activity-pager]'), {
    pageSize: ACTIVITY_PAGE_SIZE,
  })

  /** @type {any[]} */ let items = []
  /** @type {string | null} */ let nextCursor = null
  let category = ''
  let extraPages = false

  function readFilters() {
    if (typeof window !== 'undefined' && window.GymDatePicker?.flush) {
      window.GymDatePicker.flush(form)
    }
    const fd = new FormData(form)
    return {
      from: String(fd.get('from') || ''),
      to: String(fd.get('to') || ''),
      q: String(fd.get('q') || ''),
      category,
    }
  }

  function paint() {
    statsEl.innerHTML = buildActivityStatsHtml(countActivity(items), items.length)
    pager.paint(items, (rows) => {
      listEl.innerHTML = buildActivityRowsHtml(rows)
    })
    moreEl.hidden = !nextCursor
  }

  /** @param {{ silent?: boolean, append?: boolean }} [ctx] */
  async function load(ctx = {}) {
    const filters = readFilters()
    if (!filters.from || !filters.to) return
    const silent = !!ctx.silent
    const append = !!ctx.append
    if (silent && extraPages) return
    if (!silent) setStatus(status, 'بارگذاری…', 'loading')
    const params = buildActivityQuery({ ...filters, cursor: append ? nextCursor : null })
    try {
      const data = await apiGet(`/api/v1/manager/activity?${params}`)
      const fresh = Array.isArray(data.items) ? data.items : []
      items = append ? [...items, ...fresh] : fresh
      nextCursor = data.next_cursor || null
      extraPages = append
      if (!silent && !append) pager.reset()
      paint()
      if (!silent) setStatus(status, '')
    } catch (err) {
      setStatus(status, apiErrorMessage(err, 'بارگذاری فعالیت ناموفق بود'), 'error')
      throw err
    }
  }

  // First run is immediate (createAutoRefresh), then every 30s while the section is visible.
  createAutoRefresh(root, (ctx) => load(ctx), { intervalMs: 30_000 })

  form.addEventListener('submit', (e) => {
    e.preventDefault()
    void load().catch(() => {})
  })

  bindLiveSearch(form.querySelector('input[name=q]'), () => {
    void load().catch(() => {})
  })

  root.querySelectorAll('[data-cat]').forEach((node) => {
    node.addEventListener('click', () => {
      category = node.getAttribute('data-cat') || ''
      root.querySelectorAll('[data-cat]').forEach((chip) => {
        const on = chip === node
        chip.classList.toggle('is-active', on)
        chip.setAttribute('aria-pressed', on ? 'true' : 'false')
      })
      void load().catch(() => {})
    })
  })

  root.querySelector('[data-activity-older]')?.addEventListener('click', () => {
    if (!nextCursor) return
    void load({ append: true }).catch(() => {})
  })

  root.querySelector('[data-activity-export]')?.addEventListener('click', async () => {
    const filters = readFilters()
    if (!filters.from || !filters.to) {
      setStatus(status, 'بازهٔ تاریخ را انتخاب کنید.', 'error')
      return
    }
    try {
      setStatus(status, 'در حال آماده‌سازی خروجی…', 'loading')
      await downloadActivityLog(buildActivityQuery(filters), filters)
      setStatus(
        status,
        `خروجی ${formatJalaliDate(filters.from)} تا ${formatJalaliDate(filters.to)} دانلود شد.`,
        'ok',
      )
    } catch (err) {
      setStatus(status, apiErrorMessage(err, 'خروجی گرفته نشد.'), 'error')
    }
  })
}
