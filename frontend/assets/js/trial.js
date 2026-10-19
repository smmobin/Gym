import { ApiError, apiGet, apiPatch, apiPost } from './api.js'
import { formatDateTime } from './format.js'
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
      setStatus(statusEl, data.message || 'درخواست ثبت شد. میز با شما تماس می‌گیرد.', 'ok')
      form.reset()
    } catch (err) {
      setStatus(statusEl, err instanceof ApiError ? err.message : 'ارسال ناموفق بود.', 'error')
    }
  })
}

/** @param {HTMLElement} root @param {{ role: string }} user */
export function mountTrialLeads(root, user) {
  if (user.role !== 'manager' && user.role !== 'receptionist') {
    root.innerHTML = '<p class="status-msg error">صف آزمایشی فقط برای میز است.</p>'
    return
  }
  root.innerHTML = `
    <article class="panel">
      <header class="panel-head"><h2>صف جلسه آزمایشی</h2>
        <select data-filter>
          <option value="">همه</option>
          <option value="new">جدید</option>
          <option value="contacted">تماس‌گرفته</option>
          <option value="converted">تبدیل‌شده</option>
          <option value="closed">بسته</option>
        </select>
      </header>
      <div class="status-msg" data-status hidden></div>
      <div class="list" data-list></div>
      <p class="hint">برای ساخت عضو/مهمان از بخش مهمان روزانه استفاده کنید — تبدیل خودکار نیست.</p>
    </article>
  `
  const status = root.querySelector('[data-status]')
  const list = root.querySelector('[data-list]')
  const filter = /** @type {HTMLSelectElement} */ (root.querySelector('[data-filter]'))

  async function load() {
    setStatus(status, 'بارگذاری…', 'loading')
    try {
      const qs = filter.value ? `?status=${filter.value}` : ''
      const data = await apiGet(`/api/v1/trial-leads${qs}`)
      const items = data.items || []
      list.innerHTML = items.length
        ? items
            .map(
              (t) => `<div class="row-item"><div>
            <h3>${t.full_name} · ${t.mobile}</h3>
            <p>${t.preferred_time_note || '—'} · ${t.message || ''}</p>
            <p class="hint">${formatDateTime(t.created_at)} · ${t.status}</p>
          </div>
          <select data-id="${t.id}">
            <option value="new" ${t.status === 'new' ? 'selected' : ''}>جدید</option>
            <option value="contacted" ${t.status === 'contacted' ? 'selected' : ''}>تماس</option>
            <option value="converted" ${t.status === 'converted' ? 'selected' : ''}>تبدیل</option>
            <option value="closed" ${t.status === 'closed' ? 'selected' : ''}>بسته</option>
          </select></div>`,
            )
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
      setStatus(status, `${items.length.toLocaleString('fa-IR')} درخواست`, 'ok')
    } catch (err) {
      setStatus(status, err instanceof ApiError ? err.message : 'خطا', 'error')
    }
  }

  filter.addEventListener('change', () => void load())
  void load()
}
