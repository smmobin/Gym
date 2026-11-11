import { apiErrorMessage, apiGet, apiPatch, apiPost } from './api.js'
import { createAutoRefresh } from './auto-refresh.js'
import { escapeHtml } from './html.js'
import { emitLive, LIVE } from './live-data.js'
import { createListPager } from './pagination.js'
import { setStatus } from './ui.js'

/**
 * Landing testimonials management (create / edit / soft-deactivate).
 * Soft-delete only: is_active=false. Public landing shows active only.
 *
 * @param {HTMLElement} root
 * @param {{ role: string }} user
 */
export function mountTestimonials(root, user) {
  const canWrite = user.role === 'manager' || user.role === 'receptionist'

  root.innerHTML = `
    <article class="panel">
      <header class="panel-head"><h2>نظر اعضا (لندینگ)</h2></header>
      <p class="hint">این متن‌ها در بخش «نظر اعضا» صفحهٔ اصلی نشان داده می‌شوند. حذف دائمی نیست — غیرفعال کنید.</p>
      <div class="status-msg" data-status hidden></div>
      <div class="table-wrap" style="margin-top:1rem">
        <table class="responsive-table"><thead>
          <tr><th>ترتیب</th><th>نام</th><th>برچسب</th><th>متن</th><th>وضعیت</th><th></th></tr>
        </thead><tbody data-tbody></tbody></table>
      </div>
      <div data-pager class="list-pager-host" hidden></div>
    </article>
    ${
      canWrite
        ? `
    <div class="grid-2" style="margin-top:1rem">
      <article class="panel">
        <header class="panel-head"><h2>نظر جدید</h2></header>
        <form data-create class="form-grid">
          <label class="full">متن نظر *<textarea name="body" rows="4" required maxlength="2000"></textarea></label>
          <label>نام نمایشی *<input name="author_name" required maxlength="120" /></label>
          <label>برچسب (مثلاً عضو ماهانه)<input name="author_meta" maxlength="160" /></label>
          <label>ترتیب نمایش<input type="number" name="sort_order" min="0" max="9999" value="0" /></label>
          <button class="btn" type="submit">ثبت نظر</button>
        </form>
      </article>
      <article class="panel">
        <header class="panel-head"><h2>ویرایش نظر</h2></header>
        <form data-edit class="form-grid">
          <input type="hidden" name="id" />
          <label class="full">متن نظر<textarea name="body" rows="4" maxlength="2000"></textarea></label>
          <label>نام نمایشی<input name="author_name" maxlength="120" /></label>
          <label>برچسب<input name="author_meta" maxlength="160" /></label>
          <label>ترتیب نمایش<input type="number" name="sort_order" min="0" max="9999" /></label>
          <div class="inline-actions full">
            <button class="btn" type="submit" data-save disabled>ذخیره</button>
            <button class="btn ghost" type="button" data-deactivate disabled>غیرفعال</button>
            <button class="btn ghost" type="button" data-activate disabled>فعال‌سازی</button>
          </div>
        </form>
        <p class="hint" data-edit-hint>یک نظر را از جدول انتخاب کنید.</p>
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

  function previewBody(text) {
    const t = String(text || '').trim()
    if (t.length <= 72) return t
    return `${t.slice(0, 72)}…`
  }

  function renderTable() {
    if (!tbody) return
    pager.paint(items, (rows) => {
      tbody.innerHTML = rows
        .map((row) => {
          const badge = row.is_active
            ? '<span class="badge">فعال</span>'
            : '<span class="badge">غیرفعال</span>'
          const action = canWrite
            ? `<button type="button" class="btn small ghost" data-pick="${escapeHtml(row.id)}">انتخاب</button>`
            : ''
          return `<tr>
          <td data-label="ترتیب">${escapeHtml(Number(row.sort_order || 0).toLocaleString('fa-IR'))}</td>
          <td data-label="نام">${escapeHtml(row.author_name)}</td>
          <td data-label="برچسب">${escapeHtml(row.author_meta || '—')}</td>
          <td data-label="متن">${escapeHtml(previewBody(row.body))}</td>
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
    const row = items.find((x) => x.id === id)
    if (!row || !canWrite) return
    selectedId = id
    const form = /** @type {HTMLFormElement | null} */ (root.querySelector('[data-edit]'))
    if (!form) return
    form.id.value = String(row.id)
    form.body.value = row.body || ''
    form.author_name.value = row.author_name || ''
    form.author_meta.value = row.author_meta || ''
    form.sort_order.value = String(row.sort_order ?? 0)
    root.querySelectorAll('[data-save],[data-deactivate],[data-activate]').forEach((b) => {
      b.disabled = false
    })
    const deactivate = root.querySelector('[data-deactivate]')
    const activate = root.querySelector('[data-activate]')
    if (deactivate) deactivate.disabled = !row.is_active
    if (activate) activate.disabled = !!row.is_active
    const hint = root.querySelector('[data-edit-hint]')
    if (hint) hint.textContent = `ویرایش: ${row.author_name}`
  }

  /** @param {FormData} fd */
  function payloadFromForm(fd) {
    const sortRaw = String(fd.get('sort_order') || '').trim()
    const meta = String(fd.get('author_meta') || '').trim()
    return {
      body: String(fd.get('body') || '').trim(),
      author_name: String(fd.get('author_name') || '').trim(),
      author_meta: meta || null,
      sort_order: sortRaw ? Number(sortRaw) : 0,
    }
  }

  /**
   * @param {{ silent?: boolean }} [ctx]
   */
  async function load(ctx = {}) {
    const silent = !!ctx.silent
    if (!silent) setStatus(status, 'بارگذاری…', 'loading')
    try {
      const data = await apiGet('/api/v1/testimonials?include_inactive=1')
      items = data.items || []
      if (!silent) pager.reset()
      renderTable()
      if (selectedId != null && items.some((p) => p.id === selectedId)) {
        select(selectedId)
      }
      if (!silent) setStatus(status, '')
    } catch (err) {
      setStatus(
        status,
        apiErrorMessage(err, 'بارگذاری ناموفق — تلاش مجدد خودکار…'),
        'error',
      )
      throw err
    }
  }

  const autoRefresh = createAutoRefresh(root, load, {
    intervalMs: 20_000,
    retryBaseMs: 2_500,
    retryMaxMs: 45_000,
    events: [LIVE.TESTIMONIALS],
  })

  root.querySelector('[data-create]')?.addEventListener('submit', async (e) => {
    e.preventDefault()
    const form = /** @type {HTMLFormElement} */ (e.target)
    if (form.dataset.busy === '1') return
    form.dataset.busy = '1'
    const submitBtn = /** @type {HTMLButtonElement | null} */ (form.querySelector('[type="submit"]'))
    if (submitBtn) submitBtn.disabled = true
    const body = { ...payloadFromForm(new FormData(form)), is_active: true }
    if (!body.body || !body.author_name) {
      setStatus(status, 'متن و نام نمایشی اجباری است.', 'error')
      form.dataset.busy = '0'
      if (submitBtn) submitBtn.disabled = false
      return
    }
    setStatus(status, 'در حال ثبت…', 'loading')
    let createdOk = false
    try {
      const res = await apiPost('/api/v1/testimonials', body)
      form.reset()
      form.sort_order.value = '0'
      if (res?.testimonial) {
        items = [...items.filter((p) => p.id !== res.testimonial.id), res.testimonial]
        items.sort((a, b) => (a.sort_order - b.sort_order) || (a.id - b.id))
        pager.reset()
        renderTable()
      }
      setStatus(status, 'نظر ثبت شد.', 'ok')
      createdOk = true
    } catch (err) {
      setStatus(status, apiErrorMessage(err, 'ثبت ناموفق'), 'error')
    } finally {
      form.dataset.busy = '0'
      if (submitBtn) submitBtn.disabled = false
    }
    if (createdOk) {
      emitLive(LIVE.TESTIMONIALS)
      await autoRefresh.refresh()
    }
  })

  root.querySelector('[data-edit]')?.addEventListener('submit', async (e) => {
    e.preventDefault()
    if (!selectedId) return
    const form = /** @type {HTMLFormElement} */ (e.target)
    if (form.dataset.busy === '1') return
    form.dataset.busy = '1'
    const payload = payloadFromForm(new FormData(form))
    /** @type {Record<string, unknown>} */
    const patch = {
      body: payload.body,
      author_name: payload.author_name,
      sort_order: payload.sort_order,
    }
    if (payload.author_meta) patch.author_meta = payload.author_meta
    else patch.clear_author_meta = true
    let savedOk = false
    try {
      const res = await apiPatch(`/api/v1/testimonials/${selectedId}`, patch)
      if (res?.testimonial) {
        items = items.map((p) => (p.id === res.testimonial.id ? res.testimonial : p))
        items.sort((a, b) => (a.sort_order - b.sort_order) || (a.id - b.id))
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
      emitLive(LIVE.TESTIMONIALS)
      await autoRefresh.refresh()
      select(selectedId)
    }
  })

  root.querySelector('[data-deactivate]')?.addEventListener('click', async () => {
    if (!selectedId) return
    if (!confirm('این نظر از صفحهٔ اصلی برداشته شود؟ (غیرفعال)')) return
    try {
      const res = await apiPatch(`/api/v1/testimonials/${selectedId}`, { is_active: false })
      if (res?.testimonial) {
        items = items.map((p) => (p.id === res.testimonial.id ? res.testimonial : p))
        renderTable()
      }
      setStatus(status, 'غیرفعال شد.', 'ok')
    } catch (err) {
      setStatus(status, apiErrorMessage(err, 'عملیات ناموفق'), 'error')
      return
    }
    emitLive(LIVE.TESTIMONIALS)
    await autoRefresh.refresh()
    select(selectedId)
  })

  root.querySelector('[data-activate]')?.addEventListener('click', async () => {
    if (!selectedId) return
    try {
      const res = await apiPatch(`/api/v1/testimonials/${selectedId}`, { is_active: true })
      if (res?.testimonial) {
        items = items.map((p) => (p.id === res.testimonial.id ? res.testimonial : p))
        renderTable()
      }
      setStatus(status, 'فعال شد.', 'ok')
    } catch (err) {
      setStatus(status, apiErrorMessage(err, 'عملیات ناموفق'), 'error')
      return
    }
    emitLive(LIVE.TESTIMONIALS)
    await autoRefresh.refresh()
    select(selectedId)
  })
}