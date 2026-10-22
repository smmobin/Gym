import { ApiError, apiGet, apiPatch, apiPost } from './api.js'
import { ROLE_LABEL } from './format.js'
import { createListPager } from './pagination.js'
import { enhancePasswordFields } from './password-toggle.js'
import { setStatus } from './ui.js'

/**
 * Staff accounts UI.
 * Manager: create/edit receptionist + trainer; managers listed read-only.
 * Receptionist: create/edit trainer only.
 *
 * @param {HTMLElement} root
 * @param {{ role: string, id?: number }} user
 */
export function mountStaff(root, user) {
  const isManager = user.role === 'manager'
  const canWrite = isManager || user.role === 'receptionist'
  const roleOptions = isManager
    ? `<option value="receptionist">منشی</option><option value="trainer">مربی</option>`
    : `<option value="trainer">مربی</option>`

  root.innerHTML = `
    <article class="panel">
      <header class="panel-head"><h2>کارکنان</h2></header>
      <p class="hint">حذف = غیرفعال‌سازی (ردیف از دیتابیس پاک نمی‌شود). اگر موبایل کارمند با عضو یکی باشد، در ورود اولویت با کارکنان است.</p>
      <div class="inline-actions">
        <button type="button" class="btn ghost" data-reload>بازخوانی</button>
      </div>
      <div class="status-msg" data-status hidden></div>
      <div class="table-wrap" style="margin-top:1rem">
        <table class="responsive-table"><thead>
          <tr><th>نام</th><th>موبایل</th><th>نقش</th><th>وضعیت</th><th></th></tr>
        </thead><tbody data-tbody></tbody></table>
      </div>
      <div data-pager class="list-pager-host" hidden></div>
    </article>
    ${
      canWrite
        ? `
    <div class="grid-2" style="margin-top:1rem">
      <article class="panel">
        <header class="panel-head"><h2>${isManager ? 'کارمند جدید' : 'مربی جدید'}</h2></header>
        <form data-create class="form-grid">
          <label>نام کامل *<input name="full_name" required minlength="2" /></label>
          <label>موبایل *<input name="mobile" required /></label>
          <label>نقش *
            <select name="role" required>${roleOptions}</select>
          </label>
          <label>رمز * (حداقل ۸)<input type="password" name="password" required minlength="8" /></label>
          <button class="btn" type="submit">ثبت</button>
        </form>
      </article>
      <article class="panel">
        <header class="panel-head"><h2>ویرایش</h2></header>
        <form data-edit class="form-grid">
          <input type="hidden" name="id" />
          <label>نام کامل<input name="full_name" minlength="2" /></label>
          <label>موبایل<input name="mobile" /></label>
          <label>نقش
            <select name="role">${roleOptions}</select>
          </label>
          <label>رمز جدید (اختیاری)<input type="password" name="password" minlength="8" placeholder="خالی = بدون تغییر" /></label>
          <div class="inline-actions full">
            <button class="btn" type="submit" data-save disabled>ذخیره</button>
            <button class="btn ghost" type="button" data-deactivate disabled>غیرفعال</button>
            <button class="btn ghost" type="button" data-activate disabled>فعال‌سازی</button>
          </div>
        </form>
        <p class="hint" data-edit-hint>یک ردیف قابل‌ویرایش را از جدول انتخاب کنید.</p>
      </article>
    </div>`
        : ''
    }
  `

  const status = root.querySelector('[data-status]')
  const tbody = root.querySelector('[data-tbody]')
  const pager = createListPager(root.querySelector('[data-pager]'))
  /** @type {any[]} */
  let items = []
  /** @type {number | null} */
  let selectedId = null

  function canEditRow(u) {
    if (!canWrite) return false
    if (u.role === 'manager') return false
    if (isManager) return u.role === 'receptionist' || u.role === 'trainer'
    return u.role === 'trainer'
  }

  function setEditEnabled(on) {
    root.querySelectorAll('[data-save],[data-deactivate],[data-activate]').forEach((b) => {
      b.disabled = !on
    })
  }

  function renderTable() {
    if (!tbody) return
    pager.paint(items, (rows) => {
      tbody.innerHTML = rows
        .map((u) => {
          const editable = canEditRow(u)
          const badge = u.is_active
            ? '<span class="badge">فعال</span>'
            : '<span class="badge">غیرفعال</span>'
          const action = editable
            ? `<button type="button" class="btn small ghost" data-pick="${u.id}">انتخاب</button>`
            : '<span class="hint">فقط‌خواندنی</span>'
          return `<tr>
          <td data-label="نام">${escapeHtml(u.full_name)}</td>
          <td data-label="موبایل">${escapeHtml(u.mobile)}</td>
          <td data-label="نقش">${ROLE_LABEL[u.role] || u.role}</td>
          <td data-label="وضعیت">${badge}</td>
          <td data-label="اقدام">${action}</td>
        </tr>`
        })
        .join('')
      tbody.querySelectorAll('[data-pick]').forEach((btn) => {
        btn.addEventListener('click', () => select(Number(btn.getAttribute('data-pick'))))
      })
    })
  }

  function select(id) {
    const u = items.find((x) => x.id === id)
    if (!u || !canEditRow(u)) return
    selectedId = id
    const form = /** @type {HTMLFormElement | null} */ (root.querySelector('[data-edit]'))
    if (!form) return
    form.id.value = String(u.id)
    form.full_name.value = u.full_name
    form.mobile.value = u.mobile
    form.role.value = u.role
    form.password.value = ''
    setEditEnabled(true)
    const deactivate = root.querySelector('[data-deactivate]')
    const activate = root.querySelector('[data-activate]')
    if (deactivate) deactivate.disabled = !u.is_active
    if (activate) activate.disabled = !!u.is_active
    const hint = root.querySelector('[data-edit-hint]')
    if (hint) hint.textContent = `ویرایش: ${u.full_name}`
  }

  async function load() {
    setStatus(status, 'بارگذاری…', 'loading')
    try {
      const data = await apiGet('/api/v1/staff')
      items = data.items || []
      pager.reset()
      renderTable()
      setStatus(status, `${items.length.toLocaleString('fa-IR')} نفر`, 'ok')
    } catch (err) {
      setStatus(status, err instanceof ApiError ? err.message : 'بارگذاری ناموفق', 'error')
    }
  }

  root.querySelector('[data-reload]')?.addEventListener('click', () => void load())

  root.querySelector('[data-create]')?.addEventListener('submit', async (e) => {
    e.preventDefault()
    const fd = new FormData(/** @type {HTMLFormElement} */ (e.target))
    setStatus(status, 'در حال ثبت…', 'loading')
    try {
      await apiPost('/api/v1/staff', {
        full_name: String(fd.get('full_name') || '').trim(),
        mobile: String(fd.get('mobile') || '').trim(),
        role: String(fd.get('role') || '').trim(),
        password: String(fd.get('password') || ''),
      })
      /** @type {HTMLFormElement} */ (e.target).reset()
      if (!isManager) {
        const roleSel = /** @type {HTMLFormElement} */ (e.target).querySelector('[name=role]')
        if (roleSel) roleSel.value = 'trainer'
      }
      setStatus(status, 'ثبت شد.', 'ok')
      await load()
    } catch (err) {
      setStatus(status, err instanceof ApiError ? err.message : 'ثبت ناموفق', 'error')
    }
  })

  root.querySelector('[data-edit]')?.addEventListener('submit', async (e) => {
    e.preventDefault()
    if (!selectedId) return
    const fd = new FormData(/** @type {HTMLFormElement} */ (e.target))
    const password = String(fd.get('password') || '')
    /** @type {Record<string, unknown>} */
    const body = {
      full_name: String(fd.get('full_name') || '').trim(),
      mobile: String(fd.get('mobile') || '').trim(),
      role: String(fd.get('role') || '').trim(),
    }
    if (password) body.password = password
    try {
      await apiPatch(`/api/v1/staff/${selectedId}`, body)
      setStatus(status, 'ذخیره شد.', 'ok')
      await load()
      select(selectedId)
    } catch (err) {
      setStatus(status, err instanceof ApiError ? err.message : 'ذخیره ناموفق', 'error')
    }
  })

  root.querySelector('[data-deactivate]')?.addEventListener('click', async () => {
    if (!selectedId) return
    if (!confirm('این کارمند غیرفعال شود؟ (حذف فیزیکی نیست)')) return
    try {
      await apiPost(`/api/v1/staff/${selectedId}/deactivate`)
      setStatus(status, 'غیرفعال شد.', 'ok')
      await load()
      select(selectedId)
    } catch (err) {
      setStatus(status, err instanceof ApiError ? err.message : 'عملیات ناموفق', 'error')
    }
  })

  root.querySelector('[data-activate]')?.addEventListener('click', async () => {
    if (!selectedId) return
    try {
      await apiPost(`/api/v1/staff/${selectedId}/activate`)
      setStatus(status, 'فعال شد.', 'ok')
      await load()
      select(selectedId)
    } catch (err) {
      setStatus(status, err instanceof ApiError ? err.message : 'عملیات ناموفق', 'error')
    }
  })

  enhancePasswordFields(root)
  void load()
}

/** @param {string} s */
function escapeHtml(s) {
  return String(s)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
}
