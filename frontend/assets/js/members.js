import { apiErrorMessage, apiGet, apiPatch, apiPost } from './api.js'
import { createAutoRefresh } from './auto-refresh.js'
import { emitLive, LIVE } from './live-data.js'
import { formatDateTime, MEMBER_STATUS } from './format.js'
import { bindLiveSearch } from './live-search.js'
import { createMemberLock, lockErrorMessage } from './lock.js'
import { createListPager } from './pagination.js'
import { enhancePasswordFields } from './password-toggle.js'
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
        <label class="full">جستجو<input type="search" data-q placeholder="نام یا موبایل" autocomplete="off" /></label>
      </div>
      <div class="status-msg" data-status hidden></div>
      <div class="table-wrap" style="margin-top:1rem">
        <table class="responsive-table"><thead>
          <tr><th>شناسه</th><th>نام</th><th>موبایل</th><th>وضعیت</th><th></th></tr>
        </thead><tbody data-tbody></tbody></table>
      </div>
      <div data-pager class="list-pager-host" hidden></div>
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
          <p class="hint full">برای کمد: بعد از ثبت، در <a href="#billing">مالی</a> طرح با برچسب «شامل کمد» تمدید کنید؛ واگذاری از <a href="#lockers">کمدها</a> است (اجارهٔ جدا در v1 نیست).</p>
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
  const pager = createListPager(root.querySelector('[data-pager]'))
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
            info.textContent = `قفل نزد شما تا ${st.expires_at ? formatDateTime(st.expires_at) : '—'}`
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

  function currentQ() {
    const el = /** @type {HTMLInputElement | null} */ (root.querySelector('[data-q]'))
    return el?.value?.trim() || ''
  }

  /**
   * @param {{ silent?: boolean }} [ctx]
   */
  async function load(ctx = {}) {
    const silent = !!ctx.silent
    if (!silent) setStatus(status, 'در حال بارگذاری…', 'loading')
    try {
      const params = new URLSearchParams()
      const q = currentQ()
      if (q) params.set('q', q)
      const qs = params.toString()
      const data = await apiGet(qs ? `/api/v1/members?${qs}` : '/api/v1/members')
      items = data.items || []
      if (!silent) pager.reset()
      renderTable()
      if (!silent) setStatus(status, '')
    } catch (err) {
      setStatus(status, apiErrorMessage(err, 'بارگذاری ناموفق — تلاش مجدد خودکار…'), 'error')
      throw err
    }
  }

  function renderTable() {
    if (!tbody) return
    pager.paint(items, (rows) => {
      tbody.innerHTML = rows
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

  const autoRefresh = createAutoRefresh(root, load, {
    intervalMs: 15_000,
    retryBaseMs: 2_500,
    retryMaxMs: 45_000,
    events: [LIVE.MEMBERS],
  })

  bindLiveSearch(
    /** @type {HTMLInputElement | null} */ (root.querySelector('[data-q]')),
    () => {
      void autoRefresh.refresh()
    },
    { delayMs: 280 },
  )

  root.querySelector('[data-create]')?.addEventListener('submit', async (e) => {
    e.preventDefault()
    const form = /** @type {HTMLFormElement} */ (e.target)
    if (form.dataset.busy === '1') return
    form.dataset.busy = '1'
    const fd = new FormData(form)
    setStatus(status, 'در حال ثبت…', 'loading')
    let createdOk = false
    try {
      await apiPost('/api/v1/members', {
        first_name: String(fd.get('first_name') || '').trim(),
        last_name: String(fd.get('last_name') || '').trim(),
        mobile: String(fd.get('mobile') || '').trim(),
        notes: String(fd.get('notes') || '').trim() || null,
      })
      form.reset()
      setStatus(status, 'عضو ثبت شد.', 'ok')
      createdOk = true
    } catch (err) {
      setStatus(status, apiErrorMessage(err, 'ثبت ناموفق'), 'error')
    } finally {
      form.dataset.busy = '0'
    }
    if (createdOk) {
      emitLive(LIVE.MEMBERS)
      await autoRefresh.refresh()
    }
  })

  root.querySelector('[data-edit]')?.addEventListener('submit', async (e) => {
    e.preventDefault()
    if (!selectedId || !lockHeldByMe) return
    const fd = new FormData(/** @type {HTMLFormElement} */ (e.target))
    let savedOk = false
    try {
      await apiPatch(`/api/v1/members/${selectedId}`, {
        first_name: String(fd.get('first_name') || '').trim(),
        last_name: String(fd.get('last_name') || '').trim(),
        mobile: String(fd.get('mobile') || '').trim(),
        notes: String(fd.get('notes') || '').trim() || null,
      })
      setStatus(status, 'ذخیره شد.', 'ok')
      savedOk = true
    } catch (err) {
      setStatus(status, lockErrorMessage(err, 'ذخیره ناموفق'), 'error')
    }
    if (savedOk) {
      emitLive(LIVE.MEMBERS)
      await autoRefresh.refresh()
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
    } catch (err) {
      setStatus(status, lockErrorMessage(err, 'آرشیو ناموفق'), 'error')
      return
    }
    emitLive(LIVE.MEMBERS)
    await autoRefresh.refresh()
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

  enhancePasswordFields(root)
  return { reload: () => autoRefresh.refresh(), stop: () => autoRefresh.stop() }
}

/**
 * Shared search + selected-person chip row (RTL).
 * @param {{
 *   label?: string,
 *   inputAttr?: string,
 *   pickAttr?: string,
 *   chipAttr?: string,
 *   emptyText?: string,
 *   placeholder?: string,
 * }} [opts]
 */
export function personSelectRowHtml(opts = {}) {
  const label = opts.label || 'جستجوی عضو'
  const inputAttr = opts.inputAttr || 'data-q'
  const pickAttr = opts.pickAttr || 'data-pick'
  const chipAttr = opts.chipAttr || 'data-selected'
  const emptyText = opts.emptyText || 'عضوی انتخاب نشده'
  const ph = opts.placeholder ? ` placeholder="${escapeAttr(opts.placeholder)}"` : ''
  return `<div class="person-select">
    <span class="person-select-label">${escapeAttr(label)}</span>
    <div class="person-select-search member-search">
      <input type="search" ${inputAttr}${ph} autocomplete="off" aria-label="${escapeAttr(label)}" />
      <div class="member-pick is-overlay" ${pickAttr} hidden></div>
    </div>
    <div class="person-chip is-empty" ${chipAttr} data-person-chip>
      <span class="person-chip-mark" aria-hidden="true"></span>
      <div class="person-chip-text">
        <strong class="person-chip-title">${escapeAttr(emptyText)}</strong>
        <span class="person-chip-meta" hidden></span>
      </div>
    </div>
  </div>`
}

/**
 * @param {HTMLElement | null} el chip root (`[data-person-chip]` or legacy host)
 * @param {any | null} person
 * @param {{ emptyText?: string, title?: string, meta?: string }} [opts]
 */
export function setPersonChip(el, person, opts = {}) {
  if (!el) return
  const chip =
    el.matches?.('[data-person-chip]')
      ? el
      : el.querySelector?.('[data-person-chip]') || el
  if (!(chip instanceof HTMLElement)) return
  const emptyText = opts.emptyText || 'عضوی انتخاب نشده'
  let titleEl = chip.querySelector('.person-chip-title')
  let metaEl = chip.querySelector('.person-chip-meta')
  // Upgrade a plain hint node into a chip shell if needed.
  if (!titleEl) {
    chip.classList.add('person-chip')
    chip.setAttribute('data-person-chip', '')
    chip.innerHTML = `<span class="person-chip-mark" aria-hidden="true"></span>
      <div class="person-chip-text">
        <strong class="person-chip-title"></strong>
        <span class="person-chip-meta" hidden></span>
      </div>`
    titleEl = chip.querySelector('.person-chip-title')
    metaEl = chip.querySelector('.person-chip-meta')
  }
  if (!person) {
    chip.classList.add('is-empty')
    chip.classList.remove('is-selected')
    if (titleEl) titleEl.textContent = emptyText
    if (metaEl instanceof HTMLElement) {
      metaEl.textContent = ''
      metaEl.hidden = true
    }
    return
  }
  const title =
    opts.title ||
    `${person.first_name || ''} ${person.last_name || ''}`.trim() ||
    person.full_name ||
    '—'
  const meta =
    opts.meta != null
      ? opts.meta
      : [person.display_id, person.mobile].filter(Boolean).join(' · ')
  chip.classList.remove('is-empty')
  chip.classList.add('is-selected')
  if (titleEl) titleEl.textContent = title
  if (metaEl instanceof HTMLElement) {
    metaEl.textContent = meta
    metaEl.hidden = !meta
  }
}

/** @param {string} value */
function escapeAttr(value) {
  return String(value)
    .replace(/&/g, '&amp;')
    .replace(/"/g, '&quot;')
    .replace(/</g, '&lt;')
}

/**
 * Ensure search input + results sit in a relative wrapper for the overlay dropdown.
 * @param {HTMLInputElement} input
 * @param {HTMLElement} pickRoot
 */
function ensureMemberSearchWrap(input, pickRoot) {
  let wrap = /** @type {HTMLElement | null} */ (input.closest('.member-search'))
  if (wrap && wrap.contains(pickRoot)) {
    pickRoot.classList.add('is-overlay')
    return wrap
  }

  wrap = document.createElement('div')
  wrap.className = 'member-search'
  const label = input.closest('label')
  const anchor = label || input
  const parent = anchor.parentNode
  if (!parent) return wrap
  parent.insertBefore(wrap, anchor)
  wrap.appendChild(anchor)
  wrap.appendChild(pickRoot)
  pickRoot.classList.add('is-overlay')
  pickRoot.hidden = true
  return wrap
}

/**
 * Shared member search picker for other panels (floating overlay under the field).
 * @param {HTMLElement} pickRoot
 * @param {HTMLInputElement} input
 * @param {(member: any) => void} onPick
 * @param {{ showLockerEligibility?: boolean }} [opts]
 */
export function bindMemberSearch(pickRoot, input, onPick, opts = {}) {
  if (!pickRoot || !input) return
  const wrap = ensureMemberSearchWrap(input, pickRoot)
  let timer
  let open = false

  function show() {
    open = true
    wrap.classList.add('is-open')
    pickRoot.hidden = false
    pickRoot.classList.add('is-open')
  }

  function hide() {
    open = false
    wrap.classList.remove('is-open')
    pickRoot.hidden = true
    pickRoot.classList.remove('is-open')
  }

  async function run() {
    const q = input.value.trim()
    const params = new URLSearchParams()
    if (q) params.set('q', q)
    show()
    try {
      const data = await apiGet(`/api/v1/members?${params}`)
      const items = data.items || []
      renderMemberPick(
        pickRoot,
        items,
        (id) => {
          const m = items.find((x) => x.id === id)
          if (m) onPick(m)
          hide()
        },
        opts,
      )
    } catch {
      pickRoot.innerHTML = '<p class="hint member-pick-empty">جستجو ناموفق بود.</p>'
    }
  }

  input.addEventListener('input', () => {
    clearTimeout(timer)
    timer = setTimeout(() => void run(), 300)
  })
  // focus opens on first entry; click re-opens when input stayed focused after a pick.
  input.addEventListener('focus', () => void run())
  input.addEventListener('click', () => {
    if (!open) void run()
  })
  input.addEventListener('keydown', (event) => {
    if (event.key === 'Escape') hide()
  })

  document.addEventListener('click', (event) => {
    if (!open) return
    const target = /** @type {Node | null} */ (event.target)
    if (target && wrap.contains(target)) return
    hide()
  })
}
