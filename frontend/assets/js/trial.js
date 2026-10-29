import { ApiError, apiGet, apiPatch, apiPost } from './api.js'
import { formatDateTime } from './format.js'
import { createListPager } from './pagination.js'
import { setStatus } from './ui.js'

/**
 * Public trial form (landing).
 * @param {HTMLFormElement} form
 * @param {HTMLElement | null} statusEl
 */
export function mountTrialPublicForm(form, statusEl) {
  form.addEventListener('submit', async (e) => {
    e.preventDefault()
    const fd = new FormData(form)
    setStatus(statusEl, 'در حال ارسال…', 'loading')
    const preferred = String(fd.get('preferred_time_note') || fd.get('trial-time') || '').trim()
    const fullName =
      String(fd.get('full_name') || '').trim() ||
      `${String(fd.get('first_name') || '').trim()} ${String(fd.get('last_name') || '').trim()}`.trim()
    try {
      const data = await apiPost('/api/v1/public/trial-leads', {
        full_name: fullName,
        mobile: String(fd.get('mobile') || '').trim(),
        preferred_time_note: preferred || null,
        message: String(fd.get('message') || '').trim() || null,
      })
      setStatus(statusEl, data.message || 'درخواست ثبت شد. منشی با شما تماس می‌گیرد.', 'ok')
      form.reset()
    } catch (err) {
      setStatus(statusEl, err instanceof ApiError ? err.message : 'ارسال ناموفق بود.', 'error')
    }
  })
}

const STATUS_LABEL = {
  new: 'جدید',
  contacted: 'تماس',
  converted: 'تبدیل',
  closed: 'بسته',
}

/** @param {HTMLElement} root @param {{ role: string }} user */
export function mountTrialLeads(root, user) {
  if (user.role !== 'manager' && user.role !== 'receptionist') {
    root.innerHTML = '<p class="status-msg error">صف آزمایشی فقط برای منشی یا مدیر است.</p>'
    return
  }
  root.innerHTML = `
    <article class="panel trial-panel">
      <header class="panel-head">
        <h2>صف جلسه آزمایشی</h2>
        <div class="trial-filter">
          <select data-filter class="select-compact" data-compact aria-label="فیلتر وضعیت">
            <option value="">همه</option>
            <option value="new">جدید</option>
            <option value="contacted">تماس‌گرفته</option>
            <option value="converted">تبدیل‌شده</option>
            <option value="closed">بسته</option>
          </select>
        </div>
      </header>
      <div class="status-msg" data-status hidden></div>
      <div class="list trial-list" data-list></div>
      <div data-pager class="list-pager-host" hidden></div>
      <p class="hint">برای ساخت عضو/مهمان از بخش مهمان روزانه استفاده کنید — تبدیل خودکار نیست.</p>
    </article>
  `
  const status = root.querySelector('[data-status]')
  const list = root.querySelector('[data-list]')
  const pager = createListPager(root.querySelector('[data-pager]'))
  const filter = /** @type {HTMLSelectElement} */ (root.querySelector('[data-filter]'))

  function paintTrials(rows) {
    list.innerHTML = rows.length
      ? rows
          .map((t) => {
            const statusKey = String(t.status || 'new')
            return `<div class="row-item trial-row">
          <div class="trial-row-main">
            <h3>${t.full_name} <span class="trial-mobile" dir="ltr">${t.mobile}</span></h3>
            <p>${t.preferred_time_note || '—'}${t.message ? ` · ${t.message}` : ''}</p>
            <p class="hint">${formatDateTime(t.created_at)} · ${STATUS_LABEL[statusKey] || statusKey}</p>
          </div>
          <div class="trial-row-action">
            <select data-id="${t.id}" class="select-compact" data-compact aria-label="وضعیت ${t.full_name}">
              <option value="new" ${statusKey === 'new' ? 'selected' : ''}>جدید</option>
              <option value="contacted" ${statusKey === 'contacted' ? 'selected' : ''}>تماس</option>
              <option value="converted" ${statusKey === 'converted' ? 'selected' : ''}>تبدیل</option>
              <option value="closed" ${statusKey === 'closed' ? 'selected' : ''}>بسته</option>
            </select>
          </div>
        </div>`
          })
          .join('')
      : '<p class="hint">ردیفی نیست.</p>'
    list.querySelectorAll('select[data-id]').forEach((sel) => {
      sel.addEventListener('change', async () => {
        try {
          await apiPatch(`/api/v1/trial-leads/${sel.getAttribute('data-id')}`, {
            status: /** @type {HTMLSelectElement} */ (sel).value,
          })
          setStatus(status, 'وضعیت به‌روز شد.', 'ok')
        } catch (err) {
          setStatus(status, err instanceof ApiError ? err.message : 'خطا', 'error')
          await load()
        }
      })
    })
    globalThis.GymCustomSelect?.refresh?.(list)
  }

  async function load() {
    setStatus(status, 'بارگذاری…', 'loading')
    try {
      const qs = filter.value ? `?status=${filter.value}` : ''
      const data = await apiGet(`/api/v1/trial-leads${qs}`)
      const items = data.items || []
      pager.reset()
      pager.paint(items, paintTrials)
      setStatus(status, '')
    } catch (err) {
      setStatus(status, err instanceof ApiError ? err.message : 'خطا', 'error')
    }
  }

  filter.addEventListener('change', () => void load())
  globalThis.GymCustomSelect?.refresh?.(root)
  void load()
}
