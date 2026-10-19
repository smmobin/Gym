import { ApiError, apiGet, apiPost } from './api.js'
import { bindMemberSearch } from './members.js'
import { setStatus } from './ui.js'

/** @param {HTMLElement} root @param {{ role: string }} user */
export function mountLockers(root, user) {
  if (user.role !== 'manager' && user.role !== 'receptionist') {
    root.innerHTML = '<p class="status-msg error">دسترسی کمد فقط برای میز است.</p>'
    return
  }
  root.innerHTML = `
    <article class="panel">
      <header class="panel-head"><h2>کمدها</h2>
        <button type="button" class="btn ghost small" data-reload>بازخوانی</button>
      </header>
      <div class="status-msg" data-status hidden></div>
      <div class="table-wrap"><table class="responsive-table">
        <thead><tr><th>کد</th><th>وضعیت</th><th>عضو</th><th></th></tr></thead>
        <tbody data-tbody></tbody>
      </table></div>
      <form data-create class="form-grid" style="margin-top:1rem">
        <label>کد کمد جدید<input name="code" placeholder="L-06" required /></label>
        <button class="btn" type="submit">ساخت کمد</button>
      </form>
    </article>
    <article class="panel" style="margin-top:1rem">
      <header class="panel-head"><h2>واگذاری</h2></header>
      <p class="hint" data-sel-label>کمدی انتخاب نشده</p>
      <label>جستجوی عضو<input type="search" data-q /></label>
      <div class="member-pick" data-pick></div>
      <button type="button" class="btn" data-assign>واگذاری</button>
      <p class="hint">فقط با عضویت فعال طرح شامل‌کمد. اجارهٔ جدا در v1 نیست.</p>
    </article>
  `
  const status = root.querySelector('[data-status]')
  /** @type {any[]} */ let lockers = []
  /** @type {any | null} */ let selected = null
  /** @type {any | null} */ let member = null
  /** @type {any[]} */ let plans = []

  async function load() {
    try {
      const [lData, pData] = await Promise.all([
        apiGet('/api/v1/lockers'),
        apiGet('/api/v1/membership-plans'),
      ])
      lockers = lData.items || []
      plans = pData.items || []
      const tbody = root.querySelector('[data-tbody]')
      tbody.innerHTML = lockers
        .map((l) => {
          const a = l.current_assignment
          return `<tr>
            <td data-label="کد">${l.code}</td>
            <td data-label="وضعیت"><span class="badge ${l.is_free ? 'ok' : 'warn'}">${l.is_free ? 'آزاد' : 'اشغال'}${!l.is_active ? ' · غیرفعال' : ''}</span></td>
            <td data-label="عضو">${a ? `${a.member_name || a.member_display_id}` : '—'}</td>
            <td>
              <button type="button" class="btn small ghost" data-sel="${l.id}">انتخاب</button>
              ${!l.is_free ? `<button type="button" class="btn small" data-rel="${l.id}">آزادسازی</button>` : ''}
            </td>
          </tr>`
        })
        .join('')
      tbody.querySelectorAll('[data-sel]').forEach((b) =>
        b.addEventListener('click', () => {
          selected = lockers.find((x) => x.id === Number(b.getAttribute('data-sel')))
          root.querySelector('[data-sel-label]').textContent = selected
            ? `کمد ${selected.code}`
            : 'کمدی انتخاب نشده'
        }),
      )
      tbody.querySelectorAll('[data-rel]').forEach((b) =>
        b.addEventListener('click', async () => {
          try {
            await apiPost(`/api/v1/lockers/${b.getAttribute('data-rel')}/release`)
            setStatus(status, 'آزاد شد.', 'ok')
            await load()
          } catch (err) {
            setStatus(status, err instanceof ApiError ? err.message : 'خطا', 'error')
          }
        }),
      )
      setStatus(status, `${lockers.length.toLocaleString('fa-IR')} کمد`, 'ok')
    } catch (err) {
      setStatus(status, err instanceof ApiError ? err.message : 'خطا', 'error')
    }
  }

  bindMemberSearch(
    /** @type {HTMLElement} */ (root.querySelector('[data-pick]')),
    /** @type {HTMLInputElement} */ (root.querySelector('[data-q]')),
    (m) => {
      member = m
    },
  )

  root.querySelector('[data-assign]')?.addEventListener('click', async () => {
    if (!selected || !member) {
      setStatus(status, 'کمد و عضو را انتخاب کنید.', 'error')
      return
    }
    try {
      const mem = await apiGet(`/api/v1/members/${member.id}/memberships`)
      const lockerPlanIds = new Set(plans.filter((p) => p.includes_locker).map((p) => p.id))
      const eligible = (mem.items || []).filter(
        (m) => m.status === 'active' && lockerPlanIds.has(m.plan_id),
      )
      if (!eligible.length) {
        setStatus(status, 'این عضو عضویت فعال با طرح شامل‌کمد ندارد.', 'error')
        return
      }
      const body = { member_id: member.id }
      if (eligible.length > 1) body.membership_id = eligible[0].id
      else body.membership_id = eligible[0].id
      await apiPost(`/api/v1/lockers/${selected.id}/assign`, body)
      setStatus(status, 'واگذاری انجام شد.', 'ok')
      await load()
    } catch (err) {
      setStatus(status, err instanceof ApiError ? err.message : 'واگذاری ناموفق', 'error')
    }
  })

  root.querySelector('[data-create]')?.addEventListener('submit', async (e) => {
    e.preventDefault()
    const code = String(new FormData(/** @type {HTMLFormElement} */ (e.target)).get('code') || '').trim()
    try {
      await apiPost('/api/v1/lockers', { code })
      setStatus(status, 'کمد ساخته شد.', 'ok')
      /** @type {HTMLFormElement} */ (e.target).reset()
      await load()
    } catch (err) {
      setStatus(status, err instanceof ApiError ? err.message : 'ساخت ناموفق', 'error')
    }
  })

  root.querySelector('[data-reload]')?.addEventListener('click', () => void load())
  void load()
}
