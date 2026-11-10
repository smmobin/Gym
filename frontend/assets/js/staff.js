import { apiErrorMessage, apiGet, apiPatch, apiPost } from './api.js'
import { createAutoRefresh } from './auto-refresh.js'
import { emitLive, LIVE } from './live-data.js'
import { ROLE_LABEL } from './format.js'
import { createListPager } from './pagination.js'
import { enhanceMobileInputs, sanitizeMobileInput } from './mobile-input.js'
import { enhancePasswordFields } from './password-toggle.js'
import { setStatus } from './ui.js'

/**
 * Staff accounts UI.
 * Manager: create/edit receptionist + trainer; managers listed; also_trainer toggle.
 * Receptionist: create/edit trainer only (no also_trainer).
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

  const alsoTrainerCreate = isManager
    ? `<label class="full" data-also-trainer-create>
        <span class="inline-check">
          <input type="checkbox" name="also_trainer" value="1" />
          مربی هم هست
        </span>
        <span class="hint">با یک موبایل می‌تواند به‌عنوان مربی هم وارد شود (مدیر+منشی روی یک حساب مجاز نیست).</span>
      </label>`
    : ''

  const alsoTrainerEdit = isManager
    ? `<label class="full" data-also-trainer-edit>
        <span class="inline-check">
          <input type="checkbox" name="also_trainer" value="1" />
          مربی هم هست
        </span>
      </label>`
    : ''

  root.innerHTML = `
    <article class="panel">
      <header class="panel-head"><h2>کارکنان</h2></header>
      <p class="hint">اگر موبایل کارمند با عضو یکی باشد، یا نقش میز+مربی فعال باشد، در ورود صفحهٔ انتخاب نقش نشان داده می‌شود.</p>
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
          <label>موبایل *<input name="mobile" type="tel" inputmode="numeric" maxlength="11" minlength="11" pattern="09[0-9]{9}" required /></label>
          <label>نقش *
            <select name="role" required data-role-create>${roleOptions}</select>
          </label>
          ${alsoTrainerCreate}
          <label>رمز * (حداقل ۸)<input type="password" name="password" required minlength="8" /></label>
          <button class="btn" type="submit">ثبت</button>
        </form>
      </article>
      <article class="panel">
        <header class="panel-head"><h2>ویرایش</h2></header>
        <form data-edit class="form-grid">
          <input type="hidden" name="id" />
          <label data-edit-name>نام کامل<input name="full_name" minlength="2" /></label>
          <label data-edit-mobile>موبایل<input name="mobile" type="tel" inputmode="numeric" maxlength="11" minlength="11" pattern="09[0-9]{9}" /></label>
          <label data-edit-role>نقش
            <select name="role">${roleOptions}</select>
          </label>
          ${alsoTrainerEdit}
          <label data-edit-password>رمز جدید (اختیاری)<input type="password" name="password" minlength="8" placeholder="خالی = بدون تغییر" /></label>
          <div class="inline-actions full">
            <button class="btn" type="submit" data-save disabled>ذخیره</button>
          </div>
        </form>
        <p class="hint" data-edit-hint>یک ردیف قابل‌ویرایش را از جدول انتخاب کنید.</p>
      </article>
    </div>`
        : ''
    }
  `

  enhanceMobileInputs(root)
  const status = root.querySelector('[data-status]')
  const tbody = root.querySelector('[data-tbody]')
  const pager = createListPager(root.querySelector('[data-pager]'))
  /** @type {any[]} */
  let items = []
  /** @type {number | null} */
  let selectedId = null

  function roleLabelWithTrainer(u) {
    const base = ROLE_LABEL[u.role] || u.role
    if (u.also_trainer && (u.role === 'manager' || u.role === 'receptionist')) {
      return `${base} + مربی`
    }
    return base
  }

  function canEditRow(u) {
    if (!canWrite) return false
    if (u.role === 'manager') return isManager
    if (isManager) return u.role === 'receptionist' || u.role === 'trainer'
    return u.role === 'trainer'
  }

  function syncAlsoTrainerVisibility(form, role, { forceShow } = {}) {
    const box = form.querySelector('[data-also-trainer-create], [data-also-trainer-edit]')
    if (!(box instanceof HTMLElement)) return
    const desk = role === 'manager' || role === 'receptionist'
    box.hidden = forceShow ? false : !desk
    if (!desk && !forceShow) {
      const cb = box.querySelector('input[name=also_trainer]')
      if (cb instanceof HTMLInputElement) cb.checked = false
    }
  }

  function setEditMode(u) {
    const form = /** @type {HTMLFormElement | null} */ (root.querySelector('[data-edit]'))
    if (!form) return
    const managerOnlyAlso = u.role === 'manager'
    form.querySelectorAll('[data-edit-name], [data-edit-mobile], [data-edit-role], [data-edit-password]').forEach((el) => {
      if (el instanceof HTMLElement) el.hidden = managerOnlyAlso
    })
    const roleSel = form.querySelector('[name=role]')
    if (roleSel instanceof HTMLSelectElement) roleSel.disabled = managerOnlyAlso
    syncAlsoTrainerVisibility(form, u.role, { forceShow: managerOnlyAlso })
  }

  function setEditEnabled(on) {
    root.querySelectorAll('[data-save]').forEach((b) => {
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
          <td data-label="نقش">${escapeHtml(roleLabelWithTrainer(u))}</td>
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
    if (form.full_name) form.full_name.value = u.full_name
    if (form.mobile) form.mobile.value = sanitizeMobileInput(u.mobile || '')
    if (form.role) {
      // Manager rows keep role=manager even if select lacks that option.
      if (u.role === 'manager') {
        if (![...form.role.options].some((o) => o.value === 'manager')) {
          form.role.add(new Option('مدیر', 'manager'))
        }
      }
      form.role.value = u.role
    }
    if (form.password) form.password.value = ''
    const also = form.querySelector('input[name=also_trainer]')
    if (also instanceof HTMLInputElement) also.checked = Boolean(u.also_trainer)
    setEditMode(u)
    setEditEnabled(true)
    const hint = root.querySelector('[data-edit-hint]')
    if (hint) hint.textContent = `ویرایش: ${u.full_name}`
  }

  /**
   * @param {{ silent?: boolean }} [ctx]
   */
  async function load(ctx = {}) {
    const silent = !!ctx.silent
    if (!silent) setStatus(status, 'بارگذاری…', 'loading')
    try {
      const data = await apiGet('/api/v1/staff')
      items = data.items || []
      if (!silent) pager.reset()
      renderTable()
      if (!silent) setStatus(status, '')
    } catch (err) {
      setStatus(status, apiErrorMessage(err, 'بارگذاری ناموفق — تلاش مجدد خودکار…'), 'error')
      throw err
    }
  }

  const autoRefresh = createAutoRefresh(root, load, {
    intervalMs: 15_000,
    retryBaseMs: 2_500,
    retryMaxMs: 45_000,
    events: [LIVE.STAFF],
  })

  const createForm = root.querySelector('[data-create]')
  createForm?.querySelector('[data-role-create]')?.addEventListener('change', (e) => {
    const sel = /** @type {HTMLSelectElement} */ (e.target)
    if (createForm instanceof HTMLFormElement) syncAlsoTrainerVisibility(createForm, sel.value)
  })
  if (createForm instanceof HTMLFormElement) {
    const sel = createForm.querySelector('[data-role-create]')
    if (sel instanceof HTMLSelectElement) syncAlsoTrainerVisibility(createForm, sel.value)
  }

  createForm?.addEventListener('submit', async (e) => {
    e.preventDefault()
    const form = /** @type {HTMLFormElement} */ (e.target)
    if (form.dataset.busy === '1') return
    form.dataset.busy = '1'
    const submitBtn = /** @type {HTMLButtonElement | null} */ (form.querySelector('[type="submit"]'))
    if (submitBtn) submitBtn.disabled = true
    const fd = new FormData(form)
    const role = String(fd.get('role') || '').trim()
    /** @type {Record<string, unknown>} */
    const payload = {
      full_name: String(fd.get('full_name') || '').trim(),
      mobile: String(fd.get('mobile') || '').trim(),
      role,
      password: String(fd.get('password') || ''),
    }
    if (isManager && (role === 'receptionist' || role === 'manager')) {
      payload.also_trainer = form.querySelector('input[name=also_trainer]')?.checked === true
    }
    setStatus(status, 'در حال ثبت…', 'loading')
    let createdOk = false
    try {
      const res = await apiPost('/api/v1/staff', payload)
      form.reset()
      if (!isManager) {
        const roleSel = form.querySelector('[name=role]')
        if (roleSel instanceof HTMLSelectElement) roleSel.value = 'trainer'
      }
      syncAlsoTrainerVisibility(form, String(form.role?.value || 'receptionist'))
      if (res?.user) {
        items = [...items.filter((u) => u.id !== res.user.id), res.user]
        pager.reset()
        renderTable()
      }
      setStatus(status, 'ثبت شد.', 'ok')
      createdOk = true
    } catch (err) {
      setStatus(status, apiErrorMessage(err, 'ثبت ناموفق'), 'error')
    } finally {
      form.dataset.busy = '0'
      if (submitBtn) submitBtn.disabled = false
    }
    if (createdOk) {
      emitLive(LIVE.STAFF)
      await autoRefresh.refresh()
    }
  })

  root.querySelector('[data-edit]')?.addEventListener('submit', async (e) => {
    e.preventDefault()
    if (!selectedId) return
    const form = /** @type {HTMLFormElement} */ (e.target)
    if (form.dataset.busy === '1') return
    form.dataset.busy = '1'
    const fd = new FormData(form)
    const selected = items.find((x) => x.id === selectedId)
    /** @type {Record<string, unknown>} */
    const body = {}
    if (selected?.role === 'manager') {
      body.also_trainer = form.querySelector('input[name=also_trainer]')?.checked === true
    } else {
      body.full_name = String(fd.get('full_name') || '').trim()
      body.mobile = String(fd.get('mobile') || '').trim()
      body.role = String(fd.get('role') || '').trim()
      const password = String(fd.get('password') || '')
      if (password) body.password = password
      if (isManager && (body.role === 'receptionist' || body.role === 'manager')) {
        body.also_trainer = form.querySelector('input[name=also_trainer]')?.checked === true
      } else if (isManager && body.role === 'trainer') {
        body.also_trainer = false
      }
    }
    let savedOk = false
    try {
      await apiPatch(`/api/v1/staff/${selectedId}`, body)
      setStatus(status, 'ذخیره شد.', 'ok')
      savedOk = true
    } catch (err) {
      setStatus(status, apiErrorMessage(err, 'ذخیره ناموفق'), 'error')
    } finally {
      form.dataset.busy = '0'
    }
    if (savedOk) {
      emitLive(LIVE.STAFF)
      await autoRefresh.refresh()
      select(selectedId)
    }
  })

  enhancePasswordFields(root)
}

/** @param {string} s */
function escapeHtml(s) {
  return String(s)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
}
