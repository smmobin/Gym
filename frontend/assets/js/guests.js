import { ApiError, apiPost } from './api.js'
import { formatToman, PAYMENT_METHOD_LABEL } from './format.js'
import { enhanceMoneyInputs, moneyFromForm, setMoneyInput } from './money-input.js'
import { setStatus } from './ui.js'

/** @param {HTMLElement} root @param {{ role: string }} user */
export function mountGuests(root, user) {
  if (user.role !== 'manager' && user.role !== 'receptionist') {
    root.innerHTML = '<p class="status-msg error">فقط منشی یا مدیر می‌تواند مهمان روزانه ثبت کند.</p>'
    return
  }
  root.innerHTML = `
    <article class="panel">
      <header class="panel-head"><h2>مهمان روزانه</h2></header>
      <form data-form class="form-grid">
        <label>نام *<input name="first_name" required /></label>
        <label>نام خانوادگی *<input name="last_name" required /></label>
        <label>موبایل *<input name="mobile" required /></label>
        <label>مبلغ توافقی (تومان)<input data-money name="agreed_amount_toman" inputmode="numeric" value="0" required /></label>
        <label>روش پرداخت
          <select name="payment_method" data-method>
            <option value="cash">نقد</option>
            <option value="card" selected>کارت</option>
            <option value="transfer">انتقال</option>
            <option value="online">آنلاین</option>
          </select>
        </label>
        <label class="check"><input type="checkbox" name="pay_now" data-pay checked /> پرداخت هم‌اکنون</label>
        <button class="btn" type="submit">ثبت مهمان</button>
      </form>
      <div class="status-msg" data-status hidden></div>
      <div class="print-receipt" data-result hidden></div>
      <p class="hint">اگر موبایل تکراری باشد همان عضو نگه داشته می‌شود و عضویت یک‌روزه اضافه می‌شود.</p>
    </article>
  `
  const status = root.querySelector('[data-status]')
  enhanceMoneyInputs(root)
  const payNow = /** @type {HTMLInputElement} */ (root.querySelector('[data-pay]'))
  const method = /** @type {HTMLSelectElement} */ (root.querySelector('[data-method]'))
  payNow?.addEventListener('change', () => {
    method.disabled = !payNow.checked
    globalThis.GymCustomSelect?.sync?.(method)
  })

  root.querySelector('[data-form]')?.addEventListener('submit', async (e) => {
    e.preventDefault()
    const fd = new FormData(/** @type {HTMLFormElement} */ (e.target))
    setStatus(status, 'در حال ثبت…', 'loading')
    try {
      const data = await apiPost('/api/v1/guests', {
        first_name: String(fd.get('first_name')).trim(),
        last_name: String(fd.get('last_name')).trim(),
        mobile: String(fd.get('mobile')).trim(),
        agreed_amount_toman: moneyFromForm(fd, 'agreed_amount_toman'),
        payment_method: String(fd.get('payment_method')),
        pay_now: !!fd.get('pay_now'),
      })
      setStatus(status, data.message || 'ثبت شد.', 'ok')
      const result = root.querySelector('[data-result]')
      if (result) {
        result.hidden = false
        result.innerHTML = `
          <p>عضو: ${data.member.display_id} — ${data.member.first_name} ${data.member.last_name}
          ${data.reused_existing_member ? ' (عضو موجود)' : ''}</p>
          <p>عضویت: ${data.membership.plan_name || data.membership.plan_id} · ${formatToman(data.membership.agreed_amount_toman)}
          · ${data.membership.start_date}</p>
          ${
            data.payment
              ? `<p>رسید ${data.payment.receipt_number}: ${formatToman(data.payment.amount_toman)} · ${PAYMENT_METHOD_LABEL[data.payment.method] || data.payment.method}</p>`
              : '<p>پرداخت ثبت نشد.</p>'
          }`
      }
      /** @type {HTMLFormElement} */ (e.target).reset()
      const amountEl = /** @type {HTMLInputElement | null} */ (root.querySelector('[name=agreed_amount_toman]'))
      if (amountEl) setMoneyInput(amountEl, 0)
      payNow.checked = true
      method.disabled = false
    } catch (err) {
      setStatus(status, err instanceof ApiError ? err.message : 'ثبت ناموفق', 'error')
    }
  })
}
