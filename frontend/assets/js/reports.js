import { ApiError, apiGet, apiPost } from './api.js'
import { formatToman } from './format.js'
import { setStatus } from './ui.js'

/** Calendar month range in local timezone (ISO YYYY-MM-DD). */
export function monthRangeTehran(now = new Date()) {
  const y = now.getFullYear()
  const m = now.getMonth()
  const from = new Date(y, m, 1)
  const to = new Date(y, m + 1, 0)
  const iso = (d) => {
    const yy = d.getFullYear()
    const mm = String(d.getMonth() + 1).padStart(2, '0')
    const dd = String(d.getDate()).padStart(2, '0')
    return `${yy}-${mm}-${dd}`
  }
  return { from: iso(from), to: iso(to) }
}

/** @param {HTMLElement} root @param {{ role: string }} user */
export function mountReports(root, user) {
  if (user.role !== 'manager') {
    root.innerHTML =
      '<p class="status-msg error">گزارش مالی فقط برای مدیر است. سرور هم ۴۰۳ می‌دهد.</p>'
    return
  }
  const range = monthRangeTehran()
  root.innerHTML = `
    <article class="panel">
      <header class="panel-head"><h2>گزارش سود و هزینه</h2></header>
      <form data-range class="form-grid">
        <label>از<input type="date" name="from" value="${range.from}" /></label>
        <label>تا<input type="date" name="to" value="${range.to}" /></label>
        <button class="btn" type="submit">اعمال بازه</button>
      </form>
      <div class="status-msg" data-status hidden></div>
      <div class="stats" data-summary style="margin-top:1rem"></div>
      <p class="hint">درآمد = فقط پرداخت‌های paid. بدهی ≠ درآمد.</p>
    </article>
    <div class="grid-2" style="margin-top:1rem">
      <article class="panel">
        <header class="panel-head"><h2>هزینه‌ها</h2></header>
        <div class="list" data-expenses></div>
      </article>
      <article class="panel">
        <header class="panel-head"><h2>ثبت هزینه</h2></header>
        <form data-expense class="form-grid">
          <label>دسته<input name="category" required placeholder="اجاره / حقوق / …" /></label>
          <label>مبلغ (تومان)<input name="amount_toman" type="number" min="1" required /></label>
          <label>تاریخ<input name="expense_date" type="date" value="${range.to}" required /></label>
          <label class="full">یادداشت<textarea name="note"></textarea></label>
          <button class="btn" type="submit">ثبت</button>
        </form>
      </article>
    </div>
  `
  const status = root.querySelector('[data-status]')

  async function load(from, to) {
    setStatus(status, 'بارگذاری…', 'loading')
    const params = new URLSearchParams({ from, to })
    try {
      const [profit, expenses] = await Promise.all([
        apiGet(`/api/v1/reports/profit?${params}`),
        apiGet(`/api/v1/expenses?${params}`),
      ])
      root.querySelector('[data-summary]').innerHTML = `
        <article class="stat accent"><span class="stat-label">درآمد (paid)</span><strong>${formatToman(profit.income_paid_toman)}</strong></article>
        <article class="stat"><span class="stat-label">هزینه‌ها</span><strong>${formatToman(profit.expenses_toman)}</strong></article>
        <article class="stat"><span class="stat-label">سود نمایشی</span><strong>${formatToman(profit.profit_toman)}</strong></article>
      `
      const items = expenses.items || []
      root.querySelector('[data-expenses]').innerHTML = items.length
        ? items
            .map(
              (r) => `<div class="row-item"><div>
            <h3>${r.category}</h3>
            <p>${r.expense_date}${r.note ? ' · ' + r.note : ''}</p></div>
            <em>${formatToman(r.amount_toman)}</em></div>`,
            )
            .join('')
        : '<p class="hint">هزینه‌ای در این بازه نیست.</p>'
      setStatus(status, profit.note || 'بازه اعمال شد.', 'ok')
    } catch (err) {
      setStatus(status, err instanceof ApiError ? err.message : 'خطا', 'error')
    }
  }

  root.querySelector('[data-range]')?.addEventListener('submit', (e) => {
    e.preventDefault()
    const fd = new FormData(/** @type {HTMLFormElement} */ (e.target))
    void load(String(fd.get('from')), String(fd.get('to')))
  })

  root.querySelector('[data-expense]')?.addEventListener('submit', async (e) => {
    e.preventDefault()
    const fd = new FormData(/** @type {HTMLFormElement} */ (e.target))
    try {
      await apiPost('/api/v1/expenses', {
        category: String(fd.get('category')).trim(),
        amount_toman: Number(fd.get('amount_toman')),
        expense_date: String(fd.get('expense_date')),
        note: String(fd.get('note') || '').trim() || null,
      })
      setStatus(status, 'هزینه ثبت شد.', 'ok')
      const rangeForm = root.querySelector('[data-range]')
      const from = /** @type {HTMLInputElement} */ (rangeForm.querySelector('[name=from]')).value
      const to = /** @type {HTMLInputElement} */ (rangeForm.querySelector('[name=to]')).value
      await load(from, to)
      /** @type {HTMLFormElement} */ (e.target).reset()
    } catch (err) {
      setStatus(status, err instanceof ApiError ? err.message : 'ثبت ناموفق', 'error')
    }
  })

  void load(range.from, range.to)
}
