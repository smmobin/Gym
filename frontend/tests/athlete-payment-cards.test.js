import { describe, expect, it } from 'vitest'

import { athletePaymentCardsHtml } from '../assets/js/athlete-payments.js'

describe('athlete payment cards', () => {
  it('renders empty hint when there are no payments', () => {
    expect(athletePaymentCardsHtml([])).toContain('پرداختی نیست')
  })

  it('renders receipt cards with Persian status, amount, method, and date', () => {
    const html = athletePaymentCardsHtml([
      {
        id: 2,
        receipt_number: 'R-10002',
        amount_toman: 1000000,
        status: 'paid',
        method: 'cash',
        paid_at: '2026-10-12T10:00:00.000Z',
        created_at: '2026-10-12T10:00:00.000Z',
      },
      {
        id: 1,
        receipt_number: 'R-10001',
        amount_toman: 1500000,
        status: 'pending',
        method: 'card',
        paid_at: null,
        created_at: '2026-10-05T10:00:00.000Z',
      },
    ])
    expect(html).toContain('athlete-payment-list')
    expect(html).toContain('athlete-payment-card')
    expect(html).toContain('R-10002')
    expect(html).toContain('پرداخت‌شده')
    expect(html).toContain('در انتظار')
    expect(html).toContain('نقد')
    expect(html).toContain('کارت')
    expect(html).toContain('badge ok')
    expect(html).toContain('badge warn')
    expect(html).toContain('تومان')
  })
})
