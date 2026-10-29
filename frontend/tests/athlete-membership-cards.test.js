import { describe, expect, it } from 'vitest'

import { athleteMembershipCardsHtml } from '../assets/js/athlete-memberships.js'

describe('athlete membership cards', () => {
  it('renders empty hint when there are no memberships', () => {
    expect(athleteMembershipCardsHtml([])).toContain('اشتراکی نیست')
  })

  it('renders a card grid with Persian status and plan details', () => {
    const html = athleteMembershipCardsHtml([
      {
        plan_id: 1,
        plan_name: '۱۲ جلسه مربی',
        status: 'active',
        start_date: '2026-10-20',
        end_date: '2026-12-19',
        agreed_amount_toman: 3600000,
      },
      {
        plan_id: 2,
        plan_name: 'ماهانه سالن',
        status: 'expired',
        start_date: '2026-10-12',
        end_date: '2026-11-11',
        agreed_amount_toman: 1500000,
      },
    ])
    expect(html).toContain('athlete-membership-grid')
    expect(html).toContain('athlete-membership-card')
    expect(html).toContain('۱۲ جلسه مربی')
    expect(html).toContain('ماهانه سالن')
    expect(html).toContain('فعال')
    expect(html).toContain('منقضی')
    expect(html).toContain('badge ok')
    expect(html).toContain('badge danger')
    expect(html).toContain('تومان')
  })
})
