import { apiErrorMessage, apiGet, apiPatch, apiPost } from './api.js'
import { createAutoRefresh } from './auto-refresh.js'
import { emitLive, LIVE } from './live-data.js'
import { formatToman } from './format.js'
import { enhanceMoneyInputs, moneyFromForm, setMoneyInput } from './money-input.js'
import { createListPager } from './pagination.js'
import { setStatus } from './ui.js'

/**
 * Membership plan management (create / edit / soft-deactivate).
 * Soft-delete only: is_active=false. Billing renew select still uses active-only GET.
 * List auto-refreshes; retries with backoff on network/API errors (no manual reload).
 *
 * @param {HTMLElement} root
 * @param {{ role: string }} user
 */
export function mountPlans(root, user) {
  const canWrite = user.role === 'manager' || user.role === 'receptionist'

  root.innerHTML = `
    <article class="panel">
      <header class="panel-head"><h2>طرح‌های عضویت</h2></header>
      <div class="status-msg" data-status hidden></div>
      <div class="table-wrap" style="margin-top:1rem">
        <table class="responsive-table"><thead>
          <tr><th>نام</th><th>مدت / جلسه</th><th>قیمت پایه</th><th>کمد</th><th>وضعیت</th><th></th></tr>
        </thead><tbody data-tbody></tbody></table>
      </div>
      <div data-pager class="list-pager-host" hidden></div>
    </article>
    ${
      canWrite
        ? `
    <div class="grid-2" style="margin-top:1rem">
      <article class="panel">
        <header class="panel-head"><h2>طرح جدید</h2></header>
        <form data-create class="form-grid">
          <label class="full">نام *<input name="name" required /></label>
          <label class="full">توضیح<textarea name="description"></textarea></label>
          <label>مدت (روز)<input type="number" name="duration_days" min="1" placeholder="اختیاری" /></label>
          <label>تعداد جلسه<input type="number" name="session_count" min="1" placeholder="اختیاری" /></label>
          <label>قیمت پایه (تومان)<input data-money name="base_price_toman" inputmode="numeric" value="0" required /></label>
          <label class="check"><input type="checkbox" name="includes_locker" /> شامل کمد</label>
          <p class="hint full">حداقل یکی از مدت یا تعداد جلسه باید پر شود. قیمت صفر = هدیه/آزاد.</p>
          <button class="btn" type="submit">ثبت طرح</button>
        </form>
      </article>
      <article class="panel">
        <header class="panel-head"><h2>ویرایش طرح</h2></header>
        <form data-edit class="form-grid">
          <input type="hidden" name="id" />
          <label class="full">نام<input name="name" /></label>
          <label class="full">توضیح<textarea name="description"></textarea></label>
          <label>مدت (روز)<input type="number" name="duration_days" min="1" /></label>
          <label>تعداد جلسه<input type="number" name="session_count" min="1" /></label>
          <label>قیمت پایه (تومان)<input data-money name="base_price_toman" inputmode="numeric" /></label>
          <label class="check"><input type="checkbox" name="includes_locker" /> شامل کمد</label>
          <div class="inline-actions full">
            <button class="btn" type="submit" data-save disabled>ذخیره</button>
            <button class="btn ghost" type="button" data-deactivate disabled>غیرفعال</button>
            <button class="btn ghost" type="button" data-activate disabled>فعال‌سازی</button>
          </div>
        </form>
        <p class="hint" data-edit-hint>یک طرح را از جدول انتخاب کنید.</p>
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

  function durationLabel(p) {
    const parts = []
    if (p.duration_days) parts.push(`${p.duration_days} روز`)
    if (p.session_count) parts.push(`${p.session_count} جلسه`)
    return parts.join(' · ') || '—'
  }

  function renderTable() {
    if (!tbody) return
    pager.paint(items, (rows) => {
      tbody.innerHTML = rows
        .map((p) => {
          const badge = p.is_active
            ? '<span class="badge">فعال</span>'
            : '<span class="badge">غیرفعال</span>'
          const action = canWrite
            ? `<button type="button" class="btn small ghost" data-pick="${p.id}">انتخاب</button>`
            : ''
          return `<tr>
          <td data-label="نام">${escapeHtml(p.name)}</td>
          <td data-label="مدت / جلسه">${durationLabel(p)}</td>
          <td data-label="قیمت پایه">${formatToman(p.base_price_toman)}</td>
          <td data-label="کمد">${p.includes_locker ? 'بله' : '—'}</td>
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
    const p = items.find((x) => x.id === id)
    if (!p || !canWrite) return
    selectedId = id
    const form = /** @type {HTMLFormElement | null} */ (root.querySelector('[data-edit]'))
    if (!form) return
    form.id.value = String(p.id)
    form.name.value = p.name
    form.description.value = p.description || ''
    form.duration_days.value = p.duration_days != null ? String(p.duration_days) : ''
    form.session_count.value = p.session_count != null ? String(p.session_count) : ''
    setMoneyInput(/** @type {HTMLInputElement} */ (form.base_price_toman), p.base_price_toman)
    form.includes_locker.checked = !!p.includes_locker
    root.querySelectorAll('[data-save],[data-deactivate],[data-activate]').forEach((b) => {
      b.disabled = false
    })
    const deactivate = root.querySelector('[data-deactivate]')
    const activate = root.querySelector('[data-activate]')
    if (deactivate) deactivate.disabled = !p.is_active
    if (activate) activate.disabled = !!p.is_active
    const hint = root.querySelector('[data-edit-hint]')
    if (hint) hint.textContent = `ویرایش: ${p.name}`
  }

  /** @param {FormData} fd */
  function payloadFromForm(fd) {
    const durationRaw = String(fd.get('duration_days') || '').trim()
    const sessionsRaw = String(fd.get('session_count') || '').trim()
    const duration_days = durationRaw ? Number(durationRaw) : null
    const session_count = sessionsRaw ? Number(sessionsRaw) : null
    return {
      name: String(fd.get('name') || '').trim(),
      description: String(fd.get('description') || '').trim() || null,
      duration_days,
      session_count,
      base_price_toman: moneyFromForm(fd, 'base_price_toman'),
      includes_locker: fd.get('includes_locker') === 'on',
    }
  }

  /**
   * @param {{ silent?: boolean }} [ctx]
   */
  async function load(ctx = {}) {
    const silent = !!ctx.silent
    if (!silent) setStatus(status, 'بارگذاری…', 'loading')
    try {
      const data = await apiGet('/api/v1/membership-plans?include_inactive=1')
      items = data.items || []
      if (!silent) pager.reset()
      renderTable()
      if (selectedId != null && items.some((p) => p.id === selectedId)) {
        select(selectedId)
      }
      setStatus(status, `${items.length.toLocaleString('fa-IR')} طرح`, 'ok')
    } catch (err) {
      setStatus(
        status,
        apiErrorMessage(err, 'بارگذاری ناموفق — تلاش مجدد خودکار…'),
        'error',
      )
      throw err
    }
  }

  enhanceMoneyInputs(root)

  const autoRefresh = createAutoRefresh(root, load, {
    intervalMs: 15_000,
    retryBaseMs: 2_500,
    retryMaxMs: 45_000,
    events: [LIVE.PLANS],
  })

  root.querySelector('[data-create]')?.addEventListener('submit', async (e) => {
    e.preventDefault()
    const form = /** @type {HTMLFormElement} */ (e.target)
    if (form.dataset.busy === '1') return
    form.dataset.busy = '1'
    const submitBtn = /** @type {HTMLButtonElement | null} */ (form.querySelector('[type="submit"]'))
    if (submitBtn) submitBtn.disabled = true
    const fd = new FormData(form)
    const body = { ...payloadFromForm(fd), is_active: true }
    if (body.duration_days == null && body.session_count == null) {
      setStatus(status, 'حداقل یکی از مدت یا تعداد جلسه را وارد کنید.', 'error')
      form.dataset.busy = '0'
      if (submitBtn) submitBtn.disabled = false
      return
    }
    setStatus(status, 'در حال ثبت…', 'loading')
    let createdOk = false
    try {
      const res = await apiPost('/api/v1/membership-plans', body)
      form.reset()
      const priceEl = /** @type {HTMLInputElement | null} */ (form.querySelector('[name=base_price_toman]'))
      if (priceEl) setMoneyInput(priceEl, 0)
      if (res?.plan) {
        items = [...items.filter((p) => p.id !== res.plan.id), res.plan]
        pager.reset()
        renderTable()
      }
      setStatus(status, 'طرح ثبت شد.', 'ok')
      createdOk = true
    } catch (err) {
      setStatus(status, apiErrorMessage(err, 'ثبت ناموفق'), 'error')
    } finally {
      form.dataset.busy = '0'
      if (submitBtn) submitBtn.disabled = false
    }
    // Refresh outside create catch — list errors must not look like «ثبت ناموفق».
    if (createdOk) {
      emitLive(LIVE.PLANS)
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
    const body = payloadFromForm(fd)
    /** @type {Record<string, unknown>} */
    const patch = {
      name: body.name,
      description: body.description,
      base_price_toman: body.base_price_toman,
      includes_locker: body.includes_locker,
    }
    if (body.duration_days != null) patch.duration_days = body.duration_days
    else patch.clear_duration_days = true
    if (body.session_count != null) patch.session_count = body.session_count
    else patch.clear_session_count = true
    let savedOk = false
    try {
      const res = await apiPatch(`/api/v1/membership-plans/${selectedId}`, patch)
      if (res?.plan) {
        items = items.map((p) => (p.id === res.plan.id ? res.plan : p))
        renderTable()
      }
      setStatus(status, 'ذخیره شد.', 'ok')
      savedOk = true
    } catch (err) {
      setStatus(status, apiErrorMessage(err, 'ذخیره ناموفق'), 'error')
    } finally {
      form.dataset.busy = '0'
    }
    if (savedOk) {
      emitLive(LIVE.PLANS)
      await autoRefresh.refresh()
      select(selectedId)
    }
  })

  root.querySelector('[data-deactivate]')?.addEventListener('click', async () => {
    if (!selectedId) return
    if (!confirm('این طرح غیرفعال شود؟ عضویت‌های فعال فعلی قطع نمی‌شوند؛ فقط از select تمدید حذف می‌شود.'))
      return
    try {
      const res = await apiPatch(`/api/v1/membership-plans/${selectedId}`, { is_active: false })
      if (res?.plan) {
        items = items.map((p) => (p.id === res.plan.id ? res.plan : p))
        renderTable()
      }
      setStatus(status, 'غیرفعال شد.', 'ok')
    } catch (err) {
      setStatus(status, apiErrorMessage(err, 'عملیات ناموفق'), 'error')
      return
    }
    emitLive(LIVE.PLANS)
    await autoRefresh.refresh()
    select(selectedId)
  })

  root.querySelector('[data-activate]')?.addEventListener('click', async () => {
    if (!selectedId) return
    try {
      const res = await apiPatch(`/api/v1/membership-plans/${selectedId}`, { is_active: true })
      if (res?.plan) {
        items = items.map((p) => (p.id === res.plan.id ? res.plan : p))
        renderTable()
      }
      setStatus(status, 'فعال شد.', 'ok')
    } catch (err) {
      setStatus(status, apiErrorMessage(err, 'عملیات ناموفق'), 'error')
      return
    }
    emitLive(LIVE.PLANS)
    await autoRefresh.refresh()
    select(selectedId)
  })
}

/** @param {string} s */
function escapeHtml(s) {
  return String(s)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
}
