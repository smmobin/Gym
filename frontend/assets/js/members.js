import { ApiError, apiGet, apiPatch, apiPost } from './api.js'
import { MEMBER_STATUS } from './format.js'
import { createMemberLock, lockErrorMessage } from './lock.js'
import { renderMemberPick, setStatus } from './ui.js'

/**
 * @param {HTMLElement} root
 * @param {{ role: string }} user
 */
export function mountMembers(root, user) {
  const canWrite = user.role === 'manager' || user.role === 'receptionist'
  root.innerHTML = `
    <article class="panel">
      <header class="panel-head"><h2>اعضا</h2></header>
      <div class="form-grid">
        <label class="full">جستجو<input type="search" data-q placeholder="نام یا موبایل" /></label>
      </div>
      <div class="inline-actions">
        <button type="button" class="btn" data-search>جستجو</button>
        <button type="button" class="btn ghost" data-reload>بازخوانی</button>
      </div>
      <div class="status-msg" data-status hidden></div>
      <div class="table-wrap" style="margin-top:1rem">
        <table class="responsive-table"><thead>
          <tr><th>شناسه</th><th>نام</th><th>موبایل</th><th>وضعیت</th><th></th></tr>
        </thead><tbody data-tbody></tbody></table>
      </div>
    </article>
    ${
      canWrite
        ? `
    <div class="grid-2" style="margin-top:1rem">
      <article class="panel">
        <header class="panel-head"><h2>عضو جدید</h2></header>
        <form data-create class="form-grid">
          <label>نام *<input name="first_name" required /></label>
          <label>نام خانوادگی *<input name="last_name" required /></label>
          <label>موبایل *<input name="mobile" required /></label>
          <label class="full">یادداشت<textarea name="notes"></textarea></label>
          <button class="btn" type="submit">ثبت</button>
        </form>
      </article>
      <article class="panel">
        <header class="panel-head"><h2>ویرایش / رمز ورزشکار</h2></header>
        <p class="hint" data-lock-info></p>
        <form data-edit class="form-grid">
          <label>نام<input name="first_name" /></label>
          <label>نام خانوادگی<input name="last_name" /></label>
          <label>موبایل<input name="mobile" /></label>
          <label class="full">یادداشت<textarea name="notes"></textarea></label>
          <div class="inline-actions full">
            <button class="btn" type="submit" data-save disabled>ذخیره</button>
            <button class="btn ghost" type="button" data-archive disabled>آرشیو</button>
            <button class="btn ghost" type="button" data-unlock disabled>آزادسازی قفل</button>
          </div>
        </form>
        <form data-pw class="form-grid" style="margin-top:1rem">
          <label class="full">رمز ورود ورزشکار (حداقل ۸)<input type="password" name="password" minlength="8" /></label>
          <button class="btn" type="submit" data-pw-btn disabled>ست رمز ورزشکار</button>
        </form>
      </article>
    </div>`
        : ''
    }
  `

  const status = root.querySelector('[data-status]')
  const tbody = root.querySelector('[data-tbody]')
  /** @type {any[]} */
  let items = []
  /** @type {number | null} */
  let selectedId = null
  /** @type {any} */
  let lock = null
  let lockHeldByMe = false

  const locker = canWrite
    ? createMemberLock((st, err) => {
        lock = st
        lockHeldByMe = !!(st && st.held_by_me)
        const info = root.querySelector('[data-lock-info]')
        if (info) {
          if (err) info.textContent = err
          else if (st?.locked && st.held_by_me)
            info.textContent = `قفل نزد شما تا ${st.expires_at ? new Date(st.expires_at).toLocaleString('fa-IR') : '—'}`
          else if (st?.locked)
            info.textContent = `قفل نزد ${st.locked_by_name || 'دیگری'}`
          else info.textContent = selectedId ? 'بدون قفل فعال' : 'عضوی انتخاب نشده'
        }
        root.querySelectorAll('[data-save],[data-archive],[data-pw-btn]').forEach((b) => {
          b.disabled = !lockHeldByMe
        })
        const u = root.querySelector('[data-unlock]')
        if (u) u.disabled = !lockHeldByMe && user.role !== 'manager'
      })
    : null

  async function load(q) {
    setStatus(status, 'در حال بارگذاری…', 'loading')
    try {
      const params = new URLSearchParams()
      if (q?.trim()) params.set('q', q.trim())
      const qs = params.toString()
      const data = await apiGet(qs ? `/api/v1/members?${qs}` : '/api/v1/members')
      items = data.items || []
      renderTable()
      setStatus(status, `${items.length.toLocaleString('fa-IR')} عضو`, 'ok')
    } catch (err) {
      setStatus(status, err instanceof ApiError ? err.message : 'بارگذاری ناموفق', 'error')
    }
  }

  function renderTable() {
    if (!tbody) return
    tbody.innerHTML = items
      .map(
        (m) => `<tr>
        <td data-label="شناسه">${m.display_id}</td>
        <td data-label="نام">${m.first_name} ${m.last_name}</td>
        <td data-label="موبایل">${m.mobile}</td>
        <td data-label="وضعیت"><span class="badge">${MEMBER_STATUS[m.status] || m.status}</span></td>
        <td data-label="اقدام"><button type="button" class="btn small ghost" data-pick="${m.id}">انتخاب</button></td>
      </tr>`,
      )
      .join('')
    tbody.querySelectorAll('[data-pick]').forEach((btn) => {
      btn.addEventListener('click', () => select(Number(btn.getAttribute('data-pick'))))
    })
  }

  async function select(id) {
    selectedId = id
    const m = items.find((x) => x.id === id)
    const form = root.querySelector('[data-edit]')
    if (form && m) {
      form.querySelector('[name=first_name]').value = m.first_name
      form.querySelector('[name=last_name]').value = m.last_name
      form.querySelector('[name=mobile]').value = m.mobile
      form.querySelector('[name=notes]').value = m.notes || ''
    }
    if (locker) await locker.setMember(canWrite ? id : null)
  }

  root.querySelector('[data-search]')?.addEventListener('click', () => {
    const q = /** @type {HTMLInputElement} */ (root.querySelector('[data-q]')).value
    void load(q)
  })
  root.querySelector('[data-reload]')?.addEventListener('click', () => void load())

  root.querySelector('[data-create]')?.addEventListener('submit', async (e) => {
    e.preventDefault()
    const fd = new FormData(/** @type {HTMLFormElement} */ (e.target))
    setStatus(status, 'در حال ثبت…', 'loading')
    try {
      await apiPost('/api/v1/members', {
        first_name: String(fd.get('first_name') || '').trim(),
        last_name: String(fd.get('last_name') || '').trim(),
        mobile: String(fd.get('mobile') || '').trim(),
        notes: String(fd.get('notes') || '').trim() || null,
      })
      /** @type {HTMLFormElement} */ (e.target).reset()
      setStatus(status, 'عضو ثبت شد.', 'ok')
      await load()
    } catch (err) {
      setStatus(status, err instanceof ApiError ? err.message : 'ثبت ناموفق', 'error')
    }
  })

  root.querySelector('[data-edit]')?.addEventListener('submit', async (e) => {
    e.preventDefault()
    if (!selectedId || !lockHeldByMe) return
    const fd = new FormData(/** @type {HTMLFormElement} */ (e.target))
    try {
      await apiPatch(`/api/v1/members/${selectedId}`, {
        first_name: String(fd.get('first_name') || '').trim(),
        last_name: String(fd.get('last_name') || '').trim(),
        mobile: String(fd.get('mobile') || '').trim(),
        notes: String(fd.get('notes') || '').trim() || null,
      })
      setStatus(status, 'ذخیره شد.', 'ok')
      await load()
    } catch (err) {
      setStatus(status, lockErrorMessage(err, 'ذخیره ناموفق'), 'error')
    }
  })

  root.querySelector('[data-archive]')?.addEventListener('click', async () => {
    if (!selectedId || !lockHeldByMe) return
    if (!confirm('عضو آرشیو شود؟')) return
    try {
      await apiPost(`/api/v1/members/${selectedId}/archive`)
      setStatus(status, 'آرشیو شد.', 'ok')
      selectedId = null
      if (locker) await locker.release()
      await load()
    } catch (err) {
      setStatus(status, lockErrorMessage(err, 'آرشیو ناموفق'), 'error')
    }
  })

  root.querySelector('[data-unlock]')?.addEventListener('click', async () => {
    if (locker) await locker.release()
  })

  root.querySelector('[data-pw]')?.addEventListener('submit', async (e) => {
    e.preventDefault()
    if (!selectedId || !lockHeldByMe) return
    const pw = /** @type {HTMLInputElement} */ (
      /** @type {HTMLFormElement} */ (e.target).querySelector('[name=password]')
    ).value
    try {
      await apiPost(`/api/v1/members/${selectedId}/athlete-password`, { password: pw })
      setStatus(status, 'رمز ورزشکار ست شد.', 'ok')
      /** @type {HTMLFormElement} */ (e.target).reset()
    } catch (err) {
      setStatus(status, lockErrorMessage(err, 'ست رمز ناموفق'), 'error')
    }
  })

  void load()
  return { reload: load }
}

/**
 * Shared member search picker for other panels.
 * @param {HTMLElement} pickRoot
 * @param {HTMLInputElement} input
 * @param {(member: any) => void} onPick
 */
export function bindMemberSearch(pickRoot, input, onPick) {
  let timer
  async function run() {
    const q = input.value.trim()
    const params = new URLSearchParams()
    if (q) params.set('q', q)
    try {
      const data = await apiGet(`/api/v1/members?${params}`)
      renderMemberPick(
        pickRoot,
        (data.items || []).map((m) => ({
          id: m.id,
          label: `${m.first_name} ${m.last_name} — ${m.display_id} — ${m.mobile}`,
          ...m,
        })),
        (id) => {
          const m = (data.items || []).find((x) => x.id === id)
          if (m) onPick(m)
        },
      )
    } catch {
      pickRoot.innerHTML = '<p class="hint">جستجو ناموفق بود.</p>'
    }
  }
  input.addEventListener('input', () => {
    clearTimeout(timer)
    timer = setTimeout(run, 300)
  })
  input.addEventListener('focus', () => void run())
}
