import { apiGet, apiPost, ApiError } from '../api.js'
import { athleteLogout, requireAthlete } from '../auth-athlete.js'
import {
  formatDateTime,
  formatDateTimeShort,
  formatJalaliDate,
  formatToman,
  genderLabelFa,
  mountTodayDate,
} from '../format.js'
import { enhanceMoneyInputs, parseMoneyInput, setMoneyInput } from '../money-input.js'
import { startSessionActivityGuard } from '../session-activity.js'
import { initThemeToggle } from '../theme.js'
import { bindSidebarClose, bindHashNav, setStatus, showApiDown } from '../ui.js'
import { workoutPlanItemsTableHtml } from '../workout-plan-editor.js'

function payResultMessage() {
  const params = new URLSearchParams(location.search)
  const pay = params.get('pay')
  if (!pay) return null
  const receipt = params.get('receipt')
  const map = {
    ok: receipt ? `پرداخت موفق — رسید ${receipt}` : 'پرداخت موفق ثبت شد.',
    cancelled: 'پرداخت لغو شد یا ناتمام ماند.',
    failed: 'تأیید پرداخت ناموفق بود.',
    error: params.get('detail') || 'خطا در بازگشت از درگاه.',
  }
  return { text: map[pay] || null, ok: pay === 'ok' }
}

async function startOnlinePayment(body) {
  const res = await apiPost('/api/v1/athlete/payments/online/start', body)
  if (res.payment_url) {
    location.href = res.payment_url
    return
  }
  throw new Error('آدرس درگاه دریافت نشد.')
}

/**
 * @param {HTMLElement | null} root
 * @param {any[]} items
 * @param {HTMLElement | null} status
 */
function paintAthleteNotifications(root, items, status) {
  if (!root) return
  root.innerHTML = items.length
    ? items
        .map(
          (n) => `<div class="row-item ${n.is_read ? '' : 'unread'}"><div>
          <h3>${n.title}</h3>
          <p>${n.body || ''}</p>
          <p class="hint">${formatDateTime(n.created_at)}</p></div>
          ${n.is_read ? '' : `<button type="button" class="btn small ghost" data-read="${n.id}">خواندم</button>`}
        </div>`,
        )
        .join('')
    : '<p class="hint">اعلانی نیست.</p>'
  root.querySelectorAll('[data-read]').forEach((btn) =>
    btn.addEventListener('click', async () => {
      try {
        await apiPost(`/api/v1/athlete/notifications/${btn.getAttribute('data-read')}/read`)
        await reloadAthleteNotifications(status)
      } catch (err) {
        if (status) {
          setStatus(status, err instanceof ApiError ? err.message : 'علامت‌خوانی ناموفق', 'error')
        }
      }
    }),
  )
}

/** @param {HTMLElement | null} status */
async function reloadAthleteNotifications(status) {
  const data = await apiGet('/api/v1/athlete/notifications')
  paintAthleteNotifications(
    document.querySelector('[data-notifs]'),
    data.items || [],
    status,
  )
}

async function main() {
  const member = await requireAthlete()
  if (!member) return

  initThemeToggle(document)
  bindSidebarClose()
  bindHashNav('dash')

  const banner = document.querySelector('[data-api-banner]')
  const status = document.querySelector('[data-status]')

  // Re-fetch when opening اعلان‌ها so mutations (e.g. renew request) show without full reload.
  window.addEventListener('hashchange', () => {
    if (location.hash.slice(1) === 'notif') {
      void reloadAthleteNotifications(/** @type {HTMLElement} */ (status)).catch(() => {
        /* keep previous list; banner/status handled on full load */
      })
    }
  })

  const nameEl = document.querySelector('[data-user-name]')
  if (nameEl) nameEl.textContent = `${member.first_name} ${member.last_name}`
  const greet = document.querySelector('[data-greet]')
  if (greet) greet.textContent = `سلام ${member.first_name}، آماده یک تمرین خوب هستی؟`
  const avatar = document.querySelector('[data-avatar]')
  if (avatar) avatar.textContent = (member.first_name?.[0] || '') + (member.last_name?.[0] || '')
  mountTodayDate()

  document.querySelector('[data-logout]')?.addEventListener('click', async () => {
    try {
      await athleteLogout()
    } finally {
      location.href = '/login/'
    }
  })

  startSessionActivityGuard({
    touchPath: '/api/v1/athlete/auth/touch',
    logoutPath: '/api/v1/athlete/auth/logout',
  })

  const payFlash = payResultMessage()
  if (payFlash?.text) {
    setStatus(/** @type {HTMLElement} */ (status), payFlash.text, payFlash.ok ? 'ok' : 'error')
    const clean = location.pathname + (location.hash || '')
    history.replaceState({}, '', clean)
  }

  try {
    const [memberships, payments, plans, notifications, classes, gateway, renewPlans] =
      await Promise.all([
        apiGet('/api/v1/athlete/memberships'),
        apiGet('/api/v1/athlete/payments'),
        apiGet('/api/v1/athlete/workout-plans'),
        apiGet('/api/v1/athlete/notifications'),
        apiGet('/api/v1/athlete/group-classes'),
        apiGet('/api/v1/payments/gateway/status'),
        apiGet('/api/v1/athlete/membership-plans').catch(() => ({ items: [] })),
      ])
    showApiDown(/** @type {HTMLElement} */ (banner), false)

    const gatewayOn = !!gateway?.enabled
    const payHint = document.querySelector('[data-gateway-pay-hint]')
    if (payHint) {
      // Only show a positive status when gateway is on; avoid the “not configured” nag on this page.
      payHint.textContent = gatewayOn ? gateway.label || '' : ''
      payHint.hidden = !gatewayOn
    }
    document.querySelector('[data-online-renew]')?.toggleAttribute('hidden', !gatewayOn)
    document.querySelector('[data-online-debt]')?.toggleAttribute('hidden', !gatewayOn)

    const debt = memberships.debt_toman || 0
    const memItems = memberships.items || []
    const active = memItems.find((m) => m.status === 'active') || memItems[0]
    document.querySelector('[data-stat-status]').textContent = active?.status || '—'
    document.querySelector('[data-stat-end]').textContent = active?.end_date
      ? formatJalaliDate(active.end_date)
      : '—'
    document.querySelector('[data-stat-debt]').textContent = debt
      ? formatToman(debt)
      : 'تسویه‌شده'
    document.querySelector('[data-debt-line]').textContent = `بدهی: ${formatToman(debt)}`

    document.querySelector('[data-memberships]').innerHTML = memItems.length
      ? memItems
          .map(
            (m) => `<div class="row-item"><div>
          <h3>${m.plan_name || 'طرح ' + m.plan_id}</h3>
          <p>${formatJalaliDate(m.start_date)} تا ${formatJalaliDate(m.end_date)} · ${formatToman(m.agreed_amount_toman)}</p></div>
          <span class="badge">${m.status}</span></div>`,
          )
          .join('')
      : '<p class="hint">اشتراکی نیست.</p>'

    const payItems = payments.items || []
    document.querySelector('[data-payments]').innerHTML = payItems.length
      ? `<div class="table-wrap"><table class="responsive-table"><thead><tr><th>رسید</th><th>مبلغ</th><th>وضعیت</th></tr></thead><tbody>
        ${payItems
          .map(
            (p) => `<tr>
          <td>${p.receipt_number}</td>
          <td>${formatToman(p.amount_toman)}</td>
          <td>${p.status}</td></tr>`,
          )
          .join('')}
      </tbody></table></div>`
      : '<p class="hint">پرداختی نیست.</p>'

    const planItems = plans.items || []
    document.querySelector('[data-plans]').innerHTML = planItems.length
      ? `<div class="athlete-workout-plans">${planItems
          .map((p) =>
            workoutPlanItemsTableHtml(p.items || [], {
              title: p.title || 'برنامه',
              meta: `${p.trainer_full_name || '—'} · ${formatDateTime(p.updated_at || p.created_at)}`,
              legacyBody: p.body || '',
            }),
          )
          .join('')}</div>`
      : '<p class="hint">برنامه‌ای از مربی نیست.</p>'

    paintAthleteNotifications(
      document.querySelector('[data-notifs]'),
      notifications.items || [],
      /** @type {HTMLElement} */ (status),
    )

    const classItems = classes.items || []
    document.querySelector('[data-classes]').innerHTML = classItems.length
      ? classItems
          .map((c) => {
            const canBook = !c.booked_by_me && (c.remaining ?? 0) > 0
            return `<div class="row-item"><div>
            <h3>${c.title}</h3>
            <p>${formatDateTimeShort(c.starts_at)} · ${c.trainer_full_name || '—'}
            · باقی ${(c.remaining ?? 0).toLocaleString('fa-IR')} از ${(c.capacity ?? 0).toLocaleString('fa-IR')}
            ${c.gender_label ? ' · ' + genderLabelFa(c.gender_label) : ''}</p></div>
            ${
              c.booked_by_me && c.my_booking_id
                ? `<button type="button" class="btn small ghost" data-cancel="${c.my_booking_id}">لغو رزرو</button>`
                : canBook
                  ? `<button type="button" class="btn small" data-book="${c.id}">رزرو</button>`
                  : '<em>—</em>'
            }</div>`
          })
          .join('')
      : '<p class="hint">کلاس آینده‌ای نیست.</p>'

    document.querySelectorAll('[data-book]').forEach((btn) =>
      btn.addEventListener('click', async () => {
        try {
          const res = await apiPost(`/api/v1/athlete/group-classes/${btn.getAttribute('data-book')}/book`)
          setStatus(
            /** @type {HTMLElement} */ (status),
            `رزرو ثبت شد. باقی: ${(res.remaining ?? 0).toLocaleString('fa-IR')}`,
            'ok',
          )
          location.reload()
        } catch (err) {
          setStatus(
            /** @type {HTMLElement} */ (status),
            err instanceof ApiError ? err.message : 'رزرو ناموفق',
            'error',
          )
        }
      }),
    )
    document.querySelectorAll('[data-cancel]').forEach((btn) =>
      btn.addEventListener('click', async () => {
        try {
          await apiPost(`/api/v1/athlete/class-bookings/${btn.getAttribute('data-cancel')}/cancel`)
          setStatus(/** @type {HTMLElement} */ (status), 'رزرو لغو شد.', 'ok')
          location.reload()
        } catch (err) {
          setStatus(
            /** @type {HTMLElement} */ (status),
            err instanceof ApiError ? err.message : 'لغو ناموفق',
            'error',
          )
        }
      }),
    )

    document.querySelector('[data-renew]')?.addEventListener('click', async () => {
      const note = /** @type {HTMLTextAreaElement} */ (document.querySelector('[data-renew-note]'))?.value || ''
      try {
        const res = await apiPost('/api/v1/athlete/renewal-requests', { note: note || null })
        setStatus(
          /** @type {HTMLElement} */ (status),
          res.detail || 'درخواست تمدید برای منشی ارسال شد.',
          'ok',
        )
        await reloadAthleteNotifications(/** @type {HTMLElement} */ (status))
      } catch (err) {
        setStatus(
          /** @type {HTMLElement} */ (status),
          err instanceof ApiError ? err.message : 'ارسال ناموفق',
          'error',
        )
      }
    })

    if (gatewayOn) {
      const renewPlanSel = /** @type {HTMLSelectElement | null} */ (
        document.querySelector('[data-renew-plan]')
      )
      const renewAmount = /** @type {HTMLInputElement | null} */ (
        document.querySelector('[data-renew-amount]')
      )
      const debtAmount = /** @type {HTMLInputElement | null} */ (
        document.querySelector('[data-debt-amount]')
      )
      enhanceMoneyInputs(document)
      const planOpts = renewPlans.items || []
      if (renewPlanSel) {
        renewPlanSel.innerHTML = planOpts
          .map(
            (p) =>
              `<option value="${p.id}" data-price="${p.base_price_toman}">${p.name} (${formatToman(p.base_price_toman)})</option>`,
          )
          .join('')
        const syncAmount = () => {
          const opt = renewPlanSel.selectedOptions[0]
          if (renewAmount && opt) setMoneyInput(renewAmount, opt.getAttribute('data-price') || 0)
        }
        renewPlanSel.addEventListener('change', syncAmount)
        syncAmount()
      }

      if (debtAmount && debt > 0) setMoneyInput(debtAmount, debt)

      document.querySelector('[data-pay-renew]')?.addEventListener('click', async () => {
        try {
          const planId = Number(renewPlanSel?.value)
          const amount = parseMoneyInput(renewAmount?.value || 0)
          await startOnlinePayment({
            purpose: 'renew',
            plan_id: planId,
            amount_toman: amount,
            base_membership_id: active?.id || null,
          })
        } catch (err) {
          setStatus(
            /** @type {HTMLElement} */ (status),
            err instanceof ApiError ? err.message : 'شروع پرداخت ناموفق',
            'error',
          )
        }
      })

      document.querySelector('[data-pay-debt]')?.addEventListener('click', async () => {
        try {
          const amount = parseMoneyInput(debtAmount?.value || 0)
          await startOnlinePayment({ purpose: 'debt', amount_toman: amount })
        } catch (err) {
          setStatus(
            /** @type {HTMLElement} */ (status),
            err instanceof ApiError ? err.message : 'شروع پرداخت ناموفق',
            'error',
          )
        }
      })
    }
  } catch (err) {
    showApiDown(/** @type {HTMLElement} */ (banner), true)
    setStatus(
      /** @type {HTMLElement} */ (status),
      err instanceof ApiError ? err.message : 'بارگذاری داشبورد ناموفق بود.',
      'error',
    )
  }
}

void main()
