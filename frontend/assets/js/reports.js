import { apiErrorMessage, apiGet, apiPost } from './api.js'
import {
  EXPENSE_CATEGORY_CUSTOM,
  expenseCategoryLabel,
  fillExpenseCategorySelect,
  mergeExpenseCategories,
  normalizeExpenseCategoryInput,
} from './expense-categories.js'
import { formatToman } from './format.js'
import { enhanceMoneyInputs, moneyFromForm } from './money-input.js'
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
            <select name="category" data-expense-category required data-placeholder="انتخاب دسته…"></select>
          </label>
          <label data-custom-cat-wrap hidden>نام دستهٔ جدید
            <input name="category_custom" maxlength="32" placeholder="مثلاً تعمیرات" autocomplete="off" />
          </label>
          <label>مبلغ (تومان)<input data-money name="amount_toman" inputmode="numeric" required /></label>
          <label>تاریخ<input name="expense_date" type="date" value="${range.to}" required /></label>
          <label class="full">یادداشت<textarea name="note"></textarea></label>
          <button class="btn" type="submit">ثبت</button>
        </form>
        <p class="hint">از منو انتخاب کنید؛ برای دستهٔ تازه گزینهٔ «دستهٔ جدید…» را بزنید تا بعد از ثبت به لیست اضافه شود.</p>
      </article>
    </div>
  `
  const status = root.querySelector('[data-status]')
  const catSelect = /** @type {HTMLSelectElement | null} */ (
    root.querySelector('[data-expense-category]')
  )
  const customWrap = /** @type {HTMLElement | null} */ (root.querySelector('[data-custom-cat-wrap]'))
  const customInput = /** @type {HTMLInputElement | null} */ (
    root.querySelector('[name=category_custom]')
  )
  /** @type {Array<{ value: string, label: string }>} */
  let categories = mergeExpenseCategories()

  function syncCustomCatVisibility() {
    const isCustom = catSelect?.value === EXPENSE_CATEGORY_CUSTOM
    if (customWrap) customWrap.hidden = !isCustom
    if (customInput) {
      customInput.required = !!isCustom
      if (!isCustom) customInput.value = ''
    }
  }

  function paintCategorySelect() {
    fillExpenseCategorySelect(catSelect, categories)
    syncCustomCatVisibility()
  }

  paintCategorySelect()
  enhanceMoneyInputs(root)
  catSelect?.addEventListener('change', syncCustomCatVisibility)

  async function refreshCategories() {
    try {
      const data = await apiGet('/api/v1/expenses/categories')
      categories = mergeExpenseCategories(data.items || [])
      paintCategorySelect()
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
    paintCategorySelect()
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
        <article class="stat accent"><span class="stat-label">درآمد (paid)</span><strong>${formatToman(profit.income_paid_toman)}</strong></article>
        <article class="stat"><span class="stat-label">هزینه‌ها</span><strong>${formatToman(profit.expenses_toman)}</strong></article>
        <article class="stat"><span class="stat-label">سود نمایشی</span><strong>${formatToman(profit.profit_toman)}</strong></article>
      `
      const items = expenses.items || []
      root.querySelector('[data-expenses]').innerHTML = items.length
        ? items
            .map(
              (r) => `<div class="row-item"><div>
            <h3>${expenseCategoryLabel(r.category)}</h3>
            <p>${r.expense_date}${r.note ? ' · ' + r.note : ''}</p></div>
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
    const selected = String(fd.get('category') || '').trim()
    const categoryRaw =
      selected === EXPENSE_CATEGORY_CUSTOM
        ? String(fd.get('category_custom') || '').trim()
        : selected
    const category = normalizeExpenseCategoryInput(categoryRaw)
    if (!category) {
      setStatus(
        status,
        selected === EXPENSE_CATEGORY_CUSTOM
          ? 'نام دستهٔ جدید را بنویسید.'
          : 'دسته را از منو انتخاب کنید.',
        'error',
      )
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
      paintCategorySelect()
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
