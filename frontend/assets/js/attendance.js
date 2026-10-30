import { ApiError, apiGet, apiPost } from './api.js'
import { createAutoRefresh } from './auto-refresh.js'
import { emitLive, LIVE } from './live-data.js'
import { ATTENDANCE_TYPE_LABEL, formatDateTime, formatToman } from './format.js'
import { createMemberLock, lockErrorMessage } from './lock.js'
import { bindMemberSearch, personSelectRowHtml, setPersonChip } from './members.js'
import { setStatus } from './ui.js'

/** @param {HTMLElement} root @param {{ role: string }} user */
export function mountAttendance(root, user) {
  const canLock = user.role === 'manager' || user.role === 'receptionist'
  root.innerHTML = `
    <div class="grid-2">
      <article class="panel">
        <header class="panel-head"><h2>ثبت حضور</h2></header>
        ${personSelectRowHtml({ label: 'جست‌وجوی عضو', emptyText: 'عضوی انتخاب نشده' })}
        <p class="hint" data-lock></p>
        <label>نوع ورود
          <select data-type>
            <option value="gym">سالن — ورود معمولی به باشگاه / تمرین آزاد</option>
            <option value="class">کلاس — حضور مربوط به کلاس گروهی</option>
            <option value="pt">جلسه مربی — جلسه خصوصی با مربی (مصرف جدا از سالن)</option>
          </select>
        </label>
        <p class="hint">نوع ورود مشخص می‌کند این حضور از چه جنسی ثبت شود؛ روی مصرف طرح جلسه‌ای هم اثر دارد.</p>
        <div class="inline-actions">
          <button type="button" class="btn" data-checkin>ثبت ورود</button>
          <button type="button" class="btn ghost" data-second hidden>تأیید ورود دوم امروز</button>
        </div>
        <div class="status-msg" data-status hidden></div>
      </article>
      <article class="panel">
        <header class="panel-head"><h2>حضورهای امروز</h2></header>
        <div class="list" data-today></div>
      </article>
    </div>
  `
  const status = root.querySelector('[data-status]')
  const todayEl = root.querySelector('[data-today]')
  const secondBtn = (root.querySelector('[data-second]'))
  /** @type {any} */ let selected = null
  let lockHeld = false
  const locker = canLock
    ? createMemberLock((st, err) => {
        lockHeld = !!(st && st.held_by_me)
        const el = root.querySelector('[data-lock]')
        if (el) el.textContent = err || (lockHeld ? 'قفل نزد شما' : st?.locked ? 'قفل نزد دیگری' : '')
      })
    : null

  bindMemberSearch(
    (root.querySelector('[data-pick]')),
    (root.querySelector('[data-q]')),
    async (m) => {
      selected = m
      setPersonChip(root.querySelector('[data-selected]'), m)
      if (locker) await locker.setMember(m.id)
    },
  )

  /**
   * @param {{ silent?: boolean }} [_ctx]
   */
  async function loadToday(_ctx = {}) {
    try {
      const data = await apiGet('/api/v1/attendances/today')
      const items = data.items || data.attendances || []
      todayEl.innerHTML = items.length
        ? items
            .map(
              (a) => `<div class="row-item">
            <div><h3>عضو #${a.member_id}</h3>
            <p>${ATTENDANCE_TYPE_LABEL[a.attendance_type] || a.attendance_type}
             · ورود: ${formatDateTime(a.check_in_at)}
             ${a.is_open ? ' · باز' : ` · خروج: ${formatDateTime(a.check_out_at)}`}</p></div>
            ${a.is_open ? `<button type="button" class="btn small" data-out="${a.id}">خروج</button>` : '<em>—</em>'}
          </div>`,
            )
            .join('')
        : '<p class="hint">حضور امروز ثبت نشده.</p>'
      todayEl.querySelectorAll('[data-out]').forEach((btn) => {
        btn.addEventListener('click', async () => {
          try {
            await apiPost(`/api/v1/attendances/${btn.getAttribute('data-out')}/check-out`)
            setStatus(status, 'خروج ثبت شد.', 'ok')
            await autoRefresh.refresh()
          } catch (err) {
            setStatus(status, err instanceof ApiError ? err.message : 'خروج ناموفق', 'error')
          }
        })
      })
    } catch (err) {
      todayEl.innerHTML = `<p class="hint">${err instanceof ApiError ? err.message : 'خطا'}</p>`
      throw err
    }
  }

  const autoRefresh = createAutoRefresh(root, loadToday, {
    intervalMs: 15_000,
    retryBaseMs: 2_500,
    retryMaxMs: 45_000,
    events: [LIVE.ATTENDANCE],
  })

  async function checkIn(confirmSecond) {
    if (!selected) {
      setStatus(status, 'اول عضو را انتخاب کنید.', 'error')
      return
    }
    if (canLock && !lockHeld) {
      setStatus(status, 'قفل پرونده لازم است.', 'error')
      return
    }
    setStatus(status, 'در حال ثبت…', 'loading')
    secondBtn.hidden = true
    try {
      const data = await apiPost('/api/v1/attendances/check-in', {
        member_id: selected.id,
        attendance_type: /** @type {HTMLSelectElement} */ (root.querySelector('[data-type]')).value,
        confirm_second_visit: !!confirmSecond,
      })
      let msg = 'ورود ثبت شد.'
      if (data.debt_warning) msg += ` هشدار بدهی: ${formatToman(data.debt_toman)}`
      if (data.sessions_remaining != null) msg += ` · جلسه باقی‌مانده: ${data.sessions_remaining}`
      setStatus(status, msg, 'ok')
      emitLive(LIVE.ATTENDANCE)
      await autoRefresh.refresh()
    } catch (err) {
      if (err instanceof ApiError && err.status === 409 && String(err.message).includes('ورود دوم')) {
        secondBtn.hidden = false
        setStatus(status, err.message, 'error')
      } else {
        setStatus(status, lockErrorMessage(err, 'ورود ناموفق'), 'error')
      }
    }
  }

  root.querySelector('[data-checkin]')?.addEventListener('click', () => void checkIn(false))
  secondBtn?.addEventListener('click', () => void checkIn(true))
}
