import { apiGet, apiPost, ApiError } from '../api.js'
import { athleteLogout, requireAthlete } from '../auth-athlete.js'
import { formatDateTime, formatDateTimeShort, formatToman } from '../format.js'
import { bindSidebarClose, bindHashNav, setStatus, showApiDown } from '../ui.js'

async function main() {
  const member = await requireAthlete()
  if (!member) return

  bindSidebarClose()
  bindHashNav('dash')

  const nameEl = document.querySelector('[data-user-name]')
  if (nameEl) nameEl.textContent = `${member.first_name} ${member.last_name}`
  const greet = document.querySelector('[data-greet]')
  if (greet) greet.textContent = `سلام ${member.first_name}، آماده یک تمرین خوب هستی؟`
  const avatar = document.querySelector('[data-avatar]')
  if (avatar) avatar.textContent = (member.first_name?.[0] || '') + (member.last_name?.[0] || '')

  document.querySelector('[data-logout]')?.addEventListener('click', async () => {
    try {
      await athleteLogout()
    } finally {
      location.href = '/athlete/login.html'
    }
  })

  const banner = document.querySelector('[data-api-banner]')
  const status = document.querySelector('[data-status]')

  try {
    const [memberships, payments, plans, notifications, classes] = await Promise.all([
      apiGet('/api/v1/athlete/memberships'),
      apiGet('/api/v1/athlete/payments'),
      apiGet('/api/v1/athlete/workout-plans'),
      apiGet('/api/v1/athlete/notifications'),
      apiGet('/api/v1/athlete/group-classes'),
    ])
    showApiDown((banner), false)

    const debt = memberships.debt_toman || 0
    const memItems = memberships.items || []
    const active = memItems.find((m) => m.status === 'active') || memItems[0]
    document.querySelector('[data-stat-status]').textContent = active?.status || '—'
    document.querySelector('[data-stat-end]').textContent = active?.end_date || '—'
    document.querySelector('[data-stat-debt]').textContent = debt
      ? formatToman(debt)
      : 'تسویه‌شده'
    document.querySelector('[data-debt-line]').textContent = `بدهی: ${formatToman(debt)}`

    document.querySelector('[data-memberships]').innerHTML = memItems.length
      ? memItems
          .map(
            (m) => `<div class="row-item"><div>
          <h3>${m.plan_name || 'طرح ' + m.plan_id}</h3>
          <p>${m.start_date} تا ${m.end_date} · ${formatToman(m.agreed_amount_toman)}</p></div>
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
      ? planItems
          .map(
            (p) => `<div class="workout"><div>
          <h3>${p.title}</h3>
          <p>${p.body || ''}</p>
          <p class="hint">${p.trainer_full_name || '—'} · ${formatDateTime(p.updated_at || p.created_at)}</p>
        </div></div>`,
          )
          .join('')
      : '<p class="hint">برنامه‌ای از مربی نیست.</p>'

    const notifItems = notifications.items || []
    document.querySelector('[data-notifs]').innerHTML = notifItems.length
      ? notifItems
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
    document.querySelectorAll('[data-read]').forEach((btn) =>
      btn.addEventListener('click', async () => {
        await apiPost(`/api/v1/athlete/notifications/${btn.getAttribute('data-read')}/read`)
        location.reload()
      }),
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
            ${c.gender_label ? ' · ' + c.gender_label : ''}</p></div>
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
          res.detail || 'درخواست تمدید برای میز ارسال شد.',
          'ok',
        )
      } catch (err) {
        setStatus(
          /** @type {HTMLElement} */ (status),
          err instanceof ApiError ? err.message : 'ارسال ناموفق',
          'error',
        )
      }
    })
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
