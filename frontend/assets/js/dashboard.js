import { ApiError, apiGet } from './api.js'
import { expenseCategoryLabel } from './expense-categories.js'
import { formatJalaliDate, formatToman, jalaliMonthRangeLocal } from './format.js'
import { setStatus } from './ui.js'

/**
 * @param {{ income_paid_toman: number, expenses_toman: number, profit_toman: number }} profit
 * @param {number} todayCount
 * @param {number} membersCount
 */
export function buildDashboardStatsHtml(profit, todayCount, membersCount) {
  return `
    <article class="stat accent"><span class="stat-label">درآمد ماه (paid)</span><strong>${formatToman(profit.income_paid_toman)}</strong><em>فقط پرداخت‌شده</em></article>
    <article class="stat"><span class="stat-label">هزینهٔ ماه</span><strong>${formatToman(profit.expenses_toman)}</strong></article>
    <article class="stat"><span class="stat-label">سود نمایشی</span><strong>${formatToman(profit.profit_toman)}</strong><em>درآمد − هزینه</em></article>
    <article class="stat"><span class="stat-label">حاضر امروز</span><strong>${Number(todayCount || 0).toLocaleString('fa-IR')}</strong><em>عضویت فعال: ${Number(membersCount || 0).toLocaleString('fa-IR')}</em></article>
  `
}

/**
 * @param {Array<{ category: string, amount_toman: number, expense_date: string, note?: string | null }>} items
 * @param {number} [limit=5]
 */
export function buildRecentExpensesHtml(items, limit = 5) {
  const rows = (items || []).slice(0, limit)
  if (!rows.length) {
    return '<p class="hint">در این ماه هنوز هزینه‌ای ثبت نشده.</p>'
  }
  return rows
    .map((r) => {
      const label = expenseCategoryLabel(r.category)
      const note = r.note ? ` · ${r.note}` : ''
      return `<div class="row-item"><div>
        <h3>${label}</h3>
        <p>${formatJalaliDate(r.expense_date)}${note}</p></div>
        <em>${formatToman(r.amount_toman)}</em></div>`
    })
    .join('')
}

/** @param {HTMLElement} root @param {{ role: string }} user */
export function mountDashboard(root, user) {
  if (user.role !== 'manager') {
    root.innerHTML =
      '<p class="status-msg error">داشبورد مالی فقط برای مدیر است.</p>'
    return
  }

  const range = jalaliMonthRangeLocal()
  root.innerHTML = `
    <div class="status-msg" data-status hidden></div>
    <div class="stats" data-stats></div>
    <article class="panel" style="margin-top:13px">
      <header class="panel-head">
        <h2>آخرین هزینه‌های ماه</h2>
        <a class="btn ghost small" href="#finance">گزارش کامل و ثبت هزینه</a>
      </header>
      <p class="hint" data-range-label></p>
      <p class="hint">درآمد = فقط پرداخت‌های paid · بدهی ≠ درآمد. جزئیات بازه و ثبت هزینه در «گزارش مالی» است.</p>
      <div class="list" data-expenses style="margin-top:0.75rem"></div>
    </article>
  `

  const status = root.querySelector('[data-status]')
  const rangeLabel = root.querySelector('[data-range-label]')
  if (rangeLabel) {
    rangeLabel.textContent = `بازه ماه شمسی: ${formatJalaliDate(range.from)} تا ${formatJalaliDate(range.to)}`
  }

  async function load() {
    setStatus(status, 'بارگذاری خلاصه…', 'loading')
    const params = new URLSearchParams({ from: range.from, to: range.to })
    try {
      const [profit, expenses, today, members] = await Promise.all([
        apiGet(`/api/v1/reports/profit?${params}`),
        apiGet(`/api/v1/expenses?${params}`),
        apiGet('/api/v1/attendances/today'),
        apiGet('/api/v1/members?status=active'),
      ])
      const statsEl = root.querySelector('[data-stats]')
      if (statsEl) {
        statsEl.innerHTML = buildDashboardStatsHtml(
          profit,
          today.total ?? (today.items || []).length,
          members.total ?? (members.items || []).length,
        )
      }
      const expEl = root.querySelector('[data-expenses]')
      if (expEl) expEl.innerHTML = buildRecentExpensesHtml(expenses.items || [])
      setStatus(status, '') // hide success banner; hint under expenses panel is enough
    } catch (err) {
      setStatus(status, err instanceof ApiError ? err.message : 'خطا در بارگذاری داشبورد', 'error')
    }
  }

  void load()
}
