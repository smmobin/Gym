import { apiErrorMessage, apiGet, apiPost } from './api.js'
import {
  expenseCategoryLabel,
  mergeExpenseCategories,
  mountExpenseCategoryCombobox,
  normalizeExpenseCategoryInput,
} from './expense-categories.js'
import {
  formatJalaliDate,
  formatToman,
  jalaliMonthRangeLocal,
  todayRangeLocal,
} from './format.js'
import { enhanceMoneyInputs, moneyFromForm } from './money-input.js'
import { setStatus } from './ui.js'

/** @deprecated prefer todayRangeLocal / jalaliMonthRangeLocal from format.js */
export function monthRangeTehran(now = new Date()) {
  return jalaliMonthRangeLocal(now)
}

export { todayRangeLocal, jalaliMonthRangeLocal }

/** @param {HTMLElement} root @param {{ role: string }} user */
export function mountReports(root, user) {
  if (user.role !== 'manager') {
    root.innerHTML =
      '<p class="status-msg error">گزارش مالی فقط برای مدیر است. سرور هم ۴۰۳ می‌دهد.</p>'
    return
  }
  const range = todayRangeLocal()
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
      <p class="hint" style="margin-top:0.65rem">سود نمایشی = درآمد پرداخت‌شده (paid) منهای هزینه‌های همین بازه. بدهی اعضا جزو درآمد نیست.</p>
    </article>
    <div class="grid-2" style="margin-top:1rem">
      <article class="panel">
        <header class="panel-head"><h2>هزینه‌ها</h2></header>
        <div class="list" data-expenses></div>
      </article>
      <article class="panel">
        <header class="panel-head"><h2>ثبت هزینه</h2></header>
        <form data-expense class="form-grid">
          <label>دسته
            <div data-expense-cat-host></div>
          </label>
          <label>مبلغ (تومان)<input data-money name="amount_toman" inputmode="numeric" required /></label>
          <label>تاریخ<input name="expense_date" type="date" value="${range.to}" required /></label>
          <label class="full">یادداشت<textarea name="note"></textarea></label>
          <button class="btn" type="submit">ثبت</button>
        </form>
        <p class="hint">از منو انتخاب کنید یا همان‌جا دستهٔ تازه بنویسید؛ بعد از ثبت به لیست اضافه می‌شود.</p>
      </article>
    </div>
  `
  const status = root.querySelector('[data-status]')
  const catHost = /** @type {HTMLElement} */ (root.querySelector('[data-expense-cat-host]'))
  /** @type {Array<{ value: string, label: string }>} */
  let categories = mergeExpenseCategories()
  const categoryCombo = mountExpenseCategoryCombobox(catHost, {
    name: 'category',
    categories,
    required: true,
  })
  enhanceMoneyInputs(root)

  async function refreshCategories() {
    try {
      const data = await apiGet('/api/v1/expenses/categories')
      categories = mergeExpenseCategories(data.items || [])
      categoryCombo.setCategories(categories)
    } catch {
      /* keep current list */
    }
  }

  /**
   * @param {string} rawCategory
   */
  function rememberCategory(rawCategory) {
    const value = normalizeExpenseCategoryInput(rawCategory)
    if (!value) return
    categories = mergeExpenseCategories([
      ...categories,
      { value, label: expenseCategoryLabel(value) },
    ])
    categoryCombo.setCategories(categories)
  }

  async function load(from, to) {
    setStatus(status, 'بارگذاری…', 'loading')
    const params = new URLSearchParams({ from, to })
    try {
      const [profit, expenses] = await Promise.all([
        apiGet(`/api/v1/reports/profit?${params}`),
        apiGet(`/api/v1/expenses?${params}`),
      ])
      root.querySelector('[data-summary]').innerHTML = `
        <article class="stat accent"><span class="stat-label">درآمد (paid)</span><strong>${formatToman(profit.income_paid_toman)}</strong><em>${formatJalaliDate(from)} تا ${formatJalaliDate(to)}</em></article>
        <article class="stat"><span class="stat-label">هزینه‌ها</span><strong>${formatToman(profit.expenses_toman)}</strong></article>
        <article class="stat"><span class="stat-label">سود نمایشی</span><strong>${formatToman(profit.profit_toman)}</strong><em>درآمد − هزینه</em></article>
      `
      const items = expenses.items || []
      root.querySelector('[data-expenses]').innerHTML = items.length
        ? items
            .map(
              (r) => `<div class="row-item"><div>
            <h3>${expenseCategoryLabel(r.category)}</h3>
            <p>${formatJalaliDate(r.expense_date)}${r.note ? ' · ' + r.note : ''}</p></div>
            <em>${formatToman(r.amount_toman)}</em></div>`,
            )
            .join('')
        : '<p class="hint">هزینه‌ای در این بازه نیست.</p>'
      setStatus(status, '')
    } catch (err) {
      setStatus(status, apiErrorMessage(err, 'خطا'), 'error')
    }
  }

  root.querySelector('[data-range]')?.addEventListener('submit', (e) => {
    e.preventDefault()
    const fd = new FormData(/** @type {HTMLFormElement} */ (e.target))
    void load(String(fd.get('from')), String(fd.get('to')))
  })

  root.querySelector('[data-expense]')?.addEventListener('submit', async (e) => {
    e.preventDefault()
    const form = /** @type {HTMLFormElement} */ (e.target)
    const fd = new FormData(form)
    const category = normalizeExpenseCategoryInput(String(fd.get('category') || ''))
    if (!category) {
      setStatus(status, 'دسته را انتخاب یا بنویسید.', 'error')
      return
    }
    let savedOk = false
    try {
      await apiPost('/api/v1/expenses', {
        category,
        amount_toman: moneyFromForm(fd, 'amount_toman'),
        expense_date: String(fd.get('expense_date')),
        note: String(fd.get('note') || '').trim() || null,
      })
      rememberCategory(category)
      setStatus(status, 'هزینه ثبت شد.', 'ok')
      form.reset()
      categoryCombo.clear()
      enhanceMoneyInputs(root)
      savedOk = true
    } catch (err) {
      setStatus(status, apiErrorMessage(err, 'ثبت ناموفق'), 'error')
    }
    if (savedOk) {
      void refreshCategories()
      const rangeForm = root.querySelector('[data-range]')
      const from = /** @type {HTMLInputElement} */ (rangeForm.querySelector('[name=from]')).value
      const to = /** @type {HTMLInputElement} */ (rangeForm.querySelector('[name=to]')).value
      await load(from, to)
    }
  })

  void refreshCategories()
  void load(range.from, range.to)
}
