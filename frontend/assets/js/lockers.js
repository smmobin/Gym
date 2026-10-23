import { ApiError, apiErrorMessage, apiGet, apiPost } from './api.js'
import { createAutoRefresh } from './auto-refresh.js'
import { LIVE } from './live-data.js'
import { formatJalaliDate } from './format.js'
import { bindMemberSearch } from './members.js'
import { createListPager } from './pagination.js'
import { setStatus } from './ui.js'

/**
 * Plan names that include a locker (for hints / errors).
 * @param {Array<{ name?: string, includes_locker?: boolean }>} plans
 */
export function lockerPlanNames(plans) {
  return (plans || [])
    .filter((p) => p.includes_locker)
    .map((p) => p.name || 'طرح')
}

/**
 * Clear Persian message when member lacks an active locker-including membership.
 * @param {{ memberLabel?: string, planNames?: string[] }} [opts]
 */
export function ineligibleLockerAssignMessage(opts = {}) {
  const who = (opts.memberLabel || 'این عضو').trim() || 'این عضو'
  const names = opts.planNames || []
  const plansPart = names.length
    ? `طرح‌های شامل‌کمد الان: ${names.join('، ')}.`
    : 'هیچ طرح فعال شامل‌کمدی در فهرست نیست — اول در مالی طرح مناسب بسازید/فعال کنید.'
  return (
    `${who} عضویت فعال با طرح شامل‌کمد ندارد. اجارهٔ جدا برای کمد در نسخهٔ اول نیست. ` +
    `${plansPart} قدم بعد: بخش مالی (#billing) → تمدید با طرح دارای برچسب «شامل کمد».`
  )
}

/**
 * HTML for membership eligibility under the assign panel.
 * @param {Array<{ id: number, plan_id: number, plan_name?: string, status: string, start_date?: string, end_date?: string }>} memberships
 * @param {Set<number>} lockerPlanIds
 */
export function membershipEligibilityHtml(memberships, lockerPlanIds) {
  const rows = memberships || []
  if (!rows.length) {
    return '<p class="hint">این عضو هیچ عضویت فعالی ندارد. اول در مالی تمدید کنید.</p>'
  }
  return rows
    .map((m) => {
      const ok = m.status === 'active' && lockerPlanIds.has(m.plan_id)
      const badge = ok
        ? '<span class="badge ok">واجد کمد</span>'
        : '<span class="badge warn">بدون کمد</span>'
      return `<div class="row-item"><div>
        <h3>${m.plan_name || 'طرح ' + m.plan_id} · #${m.id}</h3>
        <p>${m.status} · ${formatJalaliDate(m.start_date)} تا ${formatJalaliDate(m.end_date)}</p>
      </div>${badge}</div>`
    })
    .join('')
}

/**
 * @param {Array<{ id: number, code: string, is_free: boolean, is_active: boolean, current_assignment?: any }>} lockers
 */
export function lockersTableRowsHtml(lockers) {
  return (lockers || [])
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
}

/** @param {HTMLElement} root @param {{ role: string }} user */
export function mountLockers(root, user) {
  if (user.role !== 'manager' && user.role !== 'receptionist') {
    root.innerHTML = '<p class="status-msg error">دسترسی کمد فقط برای منشی یا مدیر است.</p>'
    return
  }
  root.innerHTML = `
    <article class="panel">
      <header class="panel-head"><h2>کمدها</h2></header>
      <div class="status-msg" data-status hidden></div>
      <div class="table-wrap"><table class="responsive-table">
        <thead><tr><th>کد</th><th>وضعیت</th><th>عضو</th><th></th></tr></thead>
        <tbody data-tbody></tbody>
      </table></div>
      <div data-pager class="list-pager-host" hidden></div>
      <form data-create class="form-grid" style="margin-top:1rem">
        <label>کد کمد جدید<input name="code" placeholder="L-06" required /></label>
        <button class="btn" type="submit">ساخت کمد</button>
      </form>
    </article>
    <article class="panel" style="margin-top:1rem">
      <header class="panel-head"><h2>واگذاری</h2></header>
      <p class="hint" data-sel-label>کمدی انتخاب نشده</p>
      <p class="hint" data-plans-hint></p>
      <label>جستجوی عضو<input type="search" data-q /></label>
      <div class="member-pick" data-pick></div>
      <p class="hint" data-member-label>عضوی انتخاب نشده</p>
      <div class="list" data-eligibility></div>
      <button type="button" class="btn" data-assign>واگذاری</button>
      <p class="hint">فقط عضویت فعال با طرح شامل‌کمد. اجارهٔ جدا در v1 نیست.
        اگر عضو واجد نیست، از <a href="#billing">مالی / تمدید</a> طرح «شامل کمد» بدهید.</p>
    </article>
  `
  const status = root.querySelector('[data-status]')
  const tbody = root.querySelector('[data-tbody]')
  const pager = createListPager(root.querySelector('[data-pager]'))
  const plansHint = root.querySelector('[data-plans-hint]')
  const eligibilityEl = root.querySelector('[data-eligibility]')
  const memberLabel = root.querySelector('[data-member-label]')
  /** @type {any[]} */ let lockers = []
  /** @type {any | null} */ let selected = null
  /** @type {any | null} */ let member = null
  /** @type {any[]} */ let plans = []
  /** @type {any[]} */ let memberMemberships = []

  function lockerPlanIdSet() {
    return new Set(plans.filter((p) => p.includes_locker).map((p) => p.id))
  }

  function refreshPlansHint() {
    if (!plansHint) return
    const names = lockerPlanNames(plans)
    plansHint.textContent = names.length
      ? `طرح‌های شامل‌کمد: ${names.join('، ')}`
      : 'هیچ طرح شامل‌کمدی در فهرست فعال نیست.'
  }

  function bindTableActions() {
    if (!tbody) return
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
          await autoRefresh.refresh()
        } catch (err) {
          setStatus(status, err instanceof ApiError ? err.message : 'خطا', 'error')
        }
      }),
    )
  }

  function renderTable() {
    if (!tbody) return
    pager.paint(lockers, (rows) => {
      tbody.innerHTML = lockersTableRowsHtml(rows)
      bindTableActions()
    })
  }

  function renderEligibility() {
    if (!eligibilityEl) return
    if (!member) {
      eligibilityEl.innerHTML = ''
      return
    }
    eligibilityEl.innerHTML = membershipEligibilityHtml(memberMemberships, lockerPlanIdSet())
  }

  async function loadLockersOnly() {
    const lData = await apiGet('/api/v1/lockers')
    lockers = lData.items || []
    pager.reset()
    renderTable()
    return lockers
  }

  async function loadPlans() {
    try {
      const pData = await apiGet('/api/v1/membership-plans')
      plans = pData.items || []
      refreshPlansHint()
    } catch {
      refreshPlansHint()
    }
  }

  /**
   * @param {{ silent?: boolean }} [ctx]
   */
  async function load(ctx = {}) {
    const silent = !!ctx.silent
    try {
      await loadLockersOnly()
      await loadPlans()
      if (member) renderEligibility()
      if (!silent) {
        setStatus(status, `${lockers.length.toLocaleString('fa-IR')} کمد`, 'ok')
      }
    } catch (err) {
      setStatus(status, apiErrorMessage(err, 'بارگذاری ناموفق — تلاش مجدد خودکار…'), 'error')
      throw err
    }
  }

  const autoRefresh = createAutoRefresh(root, load, {
    intervalMs: 15_000,
    retryBaseMs: 2_500,
    retryMaxMs: 45_000,
    events: [LIVE.PLANS, LIVE.LOCKERS, LIVE.MEMBERS],
  })

  bindMemberSearch(
    /** @type {HTMLElement} */ (root.querySelector('[data-pick]')),
    /** @type {HTMLInputElement} */ (root.querySelector('[data-q]')),
    async (m) => {
      member = m
      const name = `${m.first_name || ''} ${m.last_name || ''}`.trim()
      if (memberLabel) {
        memberLabel.textContent = `${name} — ${m.display_id || ''} — ${m.mobile || ''}`
      }
      memberMemberships = []
      renderEligibility()
      try {
        const mem = await apiGet(`/api/v1/members/${m.id}/memberships`)
        memberMemberships = mem.items || []
        renderEligibility()
        const ids = lockerPlanIdSet()
        const ok = memberMemberships.some((row) => row.status === 'active' && ids.has(row.plan_id))
        if (!ok) {
          setStatus(
            status,
            ineligibleLockerAssignMessage({
              memberLabel: name || m.display_id,
              planNames: lockerPlanNames(plans),
            }),
            'error',
          )
        } else {
          setStatus(status, 'این عضو برای واگذاری کمد واجد شرایط است.', 'ok')
        }
      } catch (err) {
        setStatus(status, err instanceof ApiError ? err.message : 'بارگذاری عضویت ناموفق', 'error')
      }
    },
    { showLockerEligibility: true },
  )

  root.querySelector('[data-assign]')?.addEventListener('click', async () => {
    if (!selected || !member) {
      setStatus(status, 'کمد و عضو را انتخاب کنید.', 'error')
      return
    }
    try {
      const mem = await apiGet(`/api/v1/members/${member.id}/memberships`)
      memberMemberships = mem.items || []
      renderEligibility()
      const ids = lockerPlanIdSet()
      const eligible = (mem.items || []).filter(
        (m) => m.status === 'active' && ids.has(m.plan_id),
      )
      if (!eligible.length) {
        const name = `${member.first_name || ''} ${member.last_name || ''}`.trim()
        setStatus(
          status,
          ineligibleLockerAssignMessage({
            memberLabel: name || member.display_id,
            planNames: lockerPlanNames(plans),
          }),
          'error',
        )
        return
      }
      const body = { member_id: member.id, membership_id: eligible[0].id }
      await apiPost(`/api/v1/lockers/${selected.id}/assign`, body)
      setStatus(status, 'واگذاری انجام شد.', 'ok')
      await autoRefresh.refresh()
    } catch (err) {
      setStatus(status, err instanceof ApiError ? err.message : 'واگذاری ناموفق', 'error')
    }
  })

  root.querySelector('[data-create]')?.addEventListener('submit', async (e) => {
    e.preventDefault()
    const code = String(new FormData(/** @type {HTMLFormElement} */ (e.target)).get('code') || '').trim()
    try {
      const created = await apiPost('/api/v1/lockers', { code })
      // Optimistic row first so the table never depends on a second fetch (BUG-003)
      if (created?.id) {
        lockers = [...lockers.filter((x) => x.id !== created.id), created]
        renderTable()
      }
      try {
        /** @type {HTMLFormElement} */ (e.target).reset()
      } catch {
        /* ignore reset issues in odd DOM environments */
      }
      setStatus(
        status,
        `کمد ${created?.code || code} ساخته شد · ${lockers.length.toLocaleString('fa-IR')} کمد`,
        'ok',
      )
      try {
        await loadLockersOnly()
        // If reload raced/stale and dropped the new row, keep it visible
        if (created?.id && !lockers.some((x) => x.id === created.id)) {
          lockers = [...lockers, created]
          renderTable()
        }
        setStatus(
          status,
          `کمد ${created.code || code} ساخته شد · ${lockers.length.toLocaleString('fa-IR')} کمد`,
          'ok',
        )
      } catch (reloadErr) {
        setStatus(
          status,
          reloadErr instanceof ApiError
            ? `کمد ساخته شد (جدول به‌روز شد) ولی همگام‌سازی کامل ناموفق: ${reloadErr.message}`
            : 'کمد ساخته شد؛ جدول ممکن است لحظه‌ای تأخیر داشته باشد.',
          'error',
        )
      }
      void loadPlans()
    } catch (err) {
      setStatus(status, apiErrorMessage(err, 'ساخت ناموفق'), 'error')
    }
  })
}
