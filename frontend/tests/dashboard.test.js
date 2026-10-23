import { describe, expect, it } from 'vitest'

import {
  buildDashboardStatsHtml,
  buildRecentExpensesHtml,
} from '../assets/js/dashboard.js'
import { jalaliMonthRangeLocal } from '../assets/js/format.js'

describe('manager dashboard helpers', () => {
  it('builds Jalali month range in Gregorian ISO for API (happy path)', () => {
    const range = jalaliMonthRangeLocal(new Date(2026, 9, 23))
    expect(range).toEqual({ from: '2026-10-23', to: '2026-11-21' })
  })

  it('renders finance summary stats with Persian amounts', () => {
    const html = buildDashboardStatsHtml(
      { income_paid_toman: 1_200_000, expenses_toman: 200_000, profit_toman: 1_000_000 },
      7,
      12,
    )
    expect(html).toContain('درآمد ماه (paid)')
    expect(html).toContain('سود نمایشی')
    expect(html).toContain('حاضر امروز')
    expect(html).toContain('۱٬۲۰۰٬۰۰۰')
    expect(html).toContain('۷')
  })

  it('shows empty hint when there are no expenses (edge)', () => {
    expect(buildRecentExpensesHtml([])).toContain('هنوز هزینه‌ای ثبت نشده')
  })

  it('maps expense categories to Persian labels and Jalali dates', () => {
    const html = buildRecentExpensesHtml([
      { category: 'rent', amount_toman: 5_000_000, expense_date: '2026-10-23', note: 'مهر' },
    ])
    expect(html).toContain('اجاره')
    expect(html).toContain('۵٬۰۰۰٬۰۰۰')
    expect(html).toContain('۱ آبان ۱۴۰۵')
    expect(html).not.toContain('2026-10-23')
    expect(html).toContain('مهر')
  })
})
