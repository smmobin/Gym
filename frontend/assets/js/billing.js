import { ApiError, apiGet, apiPost } from './api.js'
import { formatJalaliDate, formatToman, onlineMethodLabel, PAYMENT_METHOD_LABEL } from './format.js'
import { createMemberLock, lockErrorMessage } from './lock.js'
import { bindMemberSearch } from './members.js'
import { enhanceMoneyInputs, moneyFromForm, setMoneyInput } from './money-input.js'
import { setStatus } from './ui.js'

/** @param {HTMLElement} root @param {{ role: string }} user */
export function mountBilling(root, user) {
  if (user.role !== 'manager' && user.role !== 'receptionist') {
    root.innerHTML = '<p class="status-msg error">دسترسی مالی فقط برای مدیر و منشی است.</p>'
    return
  }
  root.innerHTML = `
    <article class="panel">
      <header class="panel-head"><h2>مالی و تمدید</h2></header>
      <label class="full">جست‌وجوی عضو<input type="search" data-q /></label>
      <div class="member-pick" data-pick></div>
      <p class="hint" data-selected>عضوی انتخاب نشده</p>
      <p class="hint" data-lock></p>
      <p class="debt-line" data-debt></p>
      <p class="hint" data-freeze-cap></p>
      <div class="status-msg" data-status hidden></div>
    </article>
    <div class="grid-2" style="margin-top:1rem">
      <article class="panel">
        <header class="panel-head"><h2>عضویت‌ها</h2></header>
        <div class="list" data-memberships></div>
        <form data-renew class="form-grid" style="margin-top:1rem">
          <label>طرح<select data-plans required></select></label>
          <label>مبلغ توافقی (تومان)<input data-money name="amount" inputmode="numeric" required /></label>
          <button class="btn" type="submit" data-need-lock>تمدید</button>
        </form>
        <form data-freeze class="form-grid" style="margin-top:1rem">
          <label>عضویت برای توقف<select data-freeze-m></select></label>
          <label>تعداد روز<input name="days" type="number" min="1" value="3" /></label>
          <div class="inline-actions">
            <button class="btn" type="submit" data-need-lock>ثبت توقف</button>
            <button class="btn ghost" type="button" data-unfreeze data-need-lock>پایان توقف</button>
          </div>
        </form>
      </article>
      <article class="panel">
        <header class="panel-head"><h2>پرداخت‌ها</h2></header>
        <div class="list" data-payments></div>
        <form data-pay class="form-grid" style="margin-top:1rem">
          <label>مبلغ (تومان)<input data-money name="amount" inputmode="numeric" required /></label>
          <label>روش
            <select name="method">
              <option value="cash">نقد</option>
              <option value="pos" selected>کارت‌خوان</option>
              <option value="transfer">انتقال</option>
              <option value="online" data-online-option>آنلاین (بدون درگاه)</option>
            </select>
          </label>
          <label>عضویت مرتبط (اختیاری)<select data-pay-m><option value="">—</option></select></label>
          <button class="btn" type="submit" data-need-lock>ثبت پرداخت</button>
        </form>
        <p class="hint" data-online-hint>روش آنلاین فقط ثبت می‌شود؛ درگاه واقعی وصل نیست.</p>
        <div class="print-receipt" data-receipt hidden></div>
      </article>
    </div>
  `

  const status = root.querySelector('[data-status]')
  enhanceMoneyInputs(root)
  /** @type {any} */ let selected = null
  /** @type {any[]} */ let plans = []
  /** @type {any[]} */ let memberships = []
  let lockHeld = false
  const locker = createMemberLock((st, err) => {
    lockHeld = !!(st && st.held_by_me)
    const el = root.querySelector('[data-lock]')
    if (el) el.textContent = err || (lockHeld ? 'قفل نزد شما' : '')
    root.querySelectorAll('[data-need-lock]').forEach((b) => {
      b.disabled = !lockHeld
    })
  })

  async function loadGatewayLabel() {
    try {
      const gw = await apiGet('/api/v1/payments/gateway/status')
      const opt = root.querySelector('[data-online-option]')
      const hint = root.querySelector('[data-online-hint]')
      if (opt) opt.textContent = onlineMethodLabel(!!gw.enabled)
      if (hint) {
        hint.textContent = gw.enabled
          ? `${gw.label} — ثبت دستی online همچنان ممکن است؛ پرداخت واقعی ورزشکار از پنل خودش است.`
          : 'روش آنلاین فقط ثبت می‌شود؛ درگاه واقعی وصل نیست.'
      }
      PAYMENT_METHOD_LABEL.online = onlineMethodLabel(!!gw.enabled)
    } catch {
      /* keep placeholder labels */
    }
  }

  async function loadPlans() {
    const data = await apiGet('/api/v1/membership-plans')
    plans = data.items || []
    const sel = root.querySelector('[data-plans]')
    if (sel) {
      sel.innerHTML = plans
        .map((p) => {
          const lockerTag = p.includes_locker ? ' · شامل کمد' : ''
          return `<option value="${p.id}">${p.name}${lockerTag} (${formatToman(p.base_price_toman)})</option>`
        })
        .join('')
      globalThis.GymCustomSelect?.sync?.(sel)
      const amount = /** @type {HTMLInputElement | null} */ (
        root.querySelector('[data-renew] [name=amount]')
      )
      if (amount && plans[0]) setMoneyInput(amount, plans[0].base_price_toman)
      sel.addEventListener('change', () => {
        const p = plans.find((x) => String(x.id) === sel.value)
        if (p && amount) setMoneyInput(amount, p.base_price_toman)
      })
    }
  }

  async function loadMember(id) {
    const [mem, pay] = await Promise.all([
      apiGet(`/api/v1/members/${id}/memberships`),
      apiGet(`/api/v1/members/${id}/payments`),
    ])
    memberships = mem.items || []
    root.querySelector('[data-debt]').textContent = `بدهی فعلی: ${formatToman(mem.debt_toman || 0)}`
    root.querySelector('[data-freeze-cap]').textContent =
      `سقف توقف سالانه: ${(mem.remaining_freeze_days_this_year ?? 0).toLocaleString('fa-IR')} از ${(mem.freeze_annual_cap_days ?? 0).toLocaleString('fa-IR')} روز باقی‌مانده`
    root.querySelector('[data-memberships]').innerHTML = memberships.length
      ? memberships
          .map((m) => {
            const plan = plans.find((p) => p.id === m.plan_id)
            const lockerBadge = plan?.includes_locker
              ? '<span class="badge ok">شامل کمد</span>'
              : ''
            return `<div class="row-item"><div>
          <h3>${m.plan_name || 'طرح ' + m.plan_id} · #${m.id}</h3>
          <p>${formatJalaliDate(m.start_date)} تا ${formatJalaliDate(m.end_date)} · ${formatToman(m.agreed_amount_toman)} · ${m.status}
          ${m.freeze_ends_at ? ` · توقف تا ${formatJalaliDate(m.freeze_ends_at)}` : ''}</p></div>
          <span class="badge">${m.status}</span>${lockerBadge}</div>`
          })
          .join('')
      : '<p class="hint">عضویت ندارد.</p>'
    const fill = (sel) => {
      if (!sel) return
      const cur = sel.value
      sel.innerHTML =
        '<option value="">—</option>' +
        memberships
          .filter((m) => m.status === 'active' || m.status === 'frozen')
          .map((m) => `<option value="${m.id}">#${m.id} · ${m.plan_name || m.plan_id} · ${m.status}</option>`)
          .join('')
      if ([...sel.options].some((o) => o.value === cur)) sel.value = cur
      globalThis.GymCustomSelect?.sync?.(sel)
    }
    fill(root.querySelector('[data-freeze-m]'))
    fill(root.querySelector('[data-pay-m]'))
    const payments = pay.items || []
    root.querySelector('[data-payments]').innerHTML = payments.length
      ? payments
          .map(
            (p) => `<div class="row-item"><div>
          <h3>${p.receipt_number}</h3>
          <p>${formatToman(p.amount_toman)} · ${PAYMENT_METHOD_LABEL[p.method] || p.method} · ${p.status}</p></div>
          ${p.status === 'paid' ? `<button type="button" class="btn small ghost" data-refund="${p.id}">برگشت</button>` : '<em>—</em>'}
        </div>`,
          )
          .join('')
      : '<p class="hint">پرداختی نیست.</p>'
    root.querySelectorAll('[data-refund]').forEach((btn) => {
      btn.addEventListener('click', async () => {
        if (!lockHeld) return
        if (!confirm('این پرداخت برگشت بخورد؟ مبلغ ردیف عوض نمی‌شود.')) return
        try {
          const data = await apiPost(`/api/v1/payments/${btn.getAttribute('data-refund')}/refund`)
          setStatus(status, `برگشت ${data.payment.receipt_number}. بدهی: ${formatToman(data.debt_toman)}`, 'ok')
          await loadMember(id)
        } catch (err) {
          setStatus(status, lockErrorMessage(err, 'برگشت ناموفق'), 'error')
        }
      })
    })
  }

  bindMemberSearch(
    (root.querySelector('[data-pick]')),
    (root.querySelector('[data-q]')),
    async (m) => {
      selected = m
      root.querySelector('[data-selected]').textContent =
        `${m.first_name} ${m.last_name} — ${m.display_id}`
      await locker.setMember(m.id)
      await loadMember(m.id)
    },
  )

  root.querySelector('[data-renew]')?.addEventListener('submit', async (e) => {
    e.preventDefault()
    if (!selected || !lockHeld) return
    const fd = new FormData(/** @type {HTMLFormElement} */ (e.target))
    const planId = Number(/** @type {HTMLSelectElement} */ (root.querySelector('[data-plans]')).value)
    try {
      const data = await apiPost(`/api/v1/members/${selected.id}/memberships/renew`, {
        plan_id: planId,
        agreed_amount_toman: moneyFromForm(fd, 'amount'),
      })
      setStatus(
        status,
        `تمدید از ${formatJalaliDate(data.membership.start_date)} تا ${formatJalaliDate(data.membership.end_date)}. بدهی: ${formatToman(data.debt_toman)}`,
        'ok',
      )
      await loadMember(selected.id)
    } catch (err) {
      setStatus(status, lockErrorMessage(err, 'تمدید ناموفق'), 'error')
    }
  })

  root.querySelector('[data-freeze]')?.addEventListener('submit', async (e) => {
    e.preventDefault()
    if (!selected || !lockHeld) return
    const mid = Number(/** @type {HTMLSelectElement} */ (root.querySelector('[data-freeze-m]')).value)
    const days = Number(new FormData(/** @type {HTMLFormElement} */ (e.target)).get('days'))
    if (!mid) {
      setStatus(status, 'عضویت را انتخاب کنید.', 'error')
      return
    }
    try {
      const data = await apiPost(`/api/v1/memberships/${mid}/freeze`, { days })
      setStatus(
        status,
        `توقف ثبت شد. باقی سقف: ${(data.remaining_freeze_days_this_year ?? 0).toLocaleString('fa-IR')} روز`,
        'ok',
      )
      await loadMember(selected.id)
    } catch (err) {
      setStatus(status, lockErrorMessage(err, 'توقف ناموفق'), 'error')
    }
  })

  root.querySelector('[data-unfreeze]')?.addEventListener('click', async () => {
    if (!selected || !lockHeld) return
    const mid = Number(/** @type {HTMLSelectElement} */ (root.querySelector('[data-freeze-m]')).value)
    if (!mid) return
    try {
      await apiPost(`/api/v1/memberships/${mid}/unfreeze`)
      setStatus(status, 'توقف پایان یافت.', 'ok')
      await loadMember(selected.id)
    } catch (err) {
      setStatus(status, lockErrorMessage(err, 'پایان توقف ناموفق'), 'error')
    }
  })

  root.querySelector('[data-pay]')?.addEventListener('submit', async (e) => {
    e.preventDefault()
    if (!selected || !lockHeld) return
    const fd = new FormData(/** @type {HTMLFormElement} */ (e.target))
    const membershipId = /** @type {HTMLSelectElement} */ (root.querySelector('[data-pay-m]')).value
    const body = {
      member_id: selected.id,
      amount_toman: moneyFromForm(fd, 'amount'),
      method: String(fd.get('method')),
      status: 'paid',
    }
    if (membershipId) body.membership_id = Number(membershipId)
    try {
      const data = await apiPost('/api/v1/payments', body)
      setStatus(status, `پرداخت ${data.payment.receipt_number}. بدهی: ${formatToman(data.debt_toman)}`, 'ok')
      const receipt = root.querySelector('[data-receipt]')
      if (receipt) {
        receipt.hidden = false
        receipt.innerHTML = `<h3>رسید ${data.payment.receipt_number}</h3>
          <p>مبلغ: ${formatToman(data.payment.amount_toman)}</p>
          <p>روش: ${PAYMENT_METHOD_LABEL[data.payment.method] || data.payment.method}</p>
          <button type="button" class="btn small" onclick="window.print()">چاپ</button>`
      }
      await loadMember(selected.id)
    } catch (err) {
      setStatus(status, lockErrorMessage(err, 'پرداخت ناموفق'), 'error')
    }
  })

  void loadPlans().catch((err) =>
    setStatus(status, err instanceof ApiError ? err.message : 'بارگذاری طرح‌ها ناموفق', 'error'),
  )
  void loadGatewayLabel()
}
