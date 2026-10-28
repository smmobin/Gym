import { afterEach, describe, expect, it, vi } from 'vitest'

import {
  mountPublicPlans,
  pickFeaturedPlanId,
  planBulletLines,
  renderPublicPlanCards,
} from '../assets/js/public-plans.js'

describe('public landing plans', () => {
  afterEach(() => {
    vi.unstubAllGlobals()
    document.body.innerHTML = ''
  })

  it('pickFeaturedPlanId uses middle when exactly three', () => {
    const plans = [
      { id: 1, base_price_toman: 100 },
      { id: 2, base_price_toman: 50 },
      { id: 3, base_price_toman: 200 },
    ]
    expect(pickFeaturedPlanId(plans)).toBe(2)
  })

  it('pickFeaturedPlanId picks most expensive otherwise', () => {
    const plans = [
      { id: 1, base_price_toman: 100 },
      { id: 2, base_price_toman: 500 },
      { id: 3, base_price_toman: 200 },
      { id: 4, base_price_toman: 50 },
    ]
    expect(pickFeaturedPlanId(plans)).toBe(2)
  })

  it('planBulletLines includes duration sessions locker', () => {
    const lines = planBulletLines({
      id: 1,
      name: 'تست',
      description: 'دسترسی سالن',
      duration_days: 30,
      session_count: 8,
      base_price_toman: 1_000_000,
      includes_locker: true,
    })
    expect(lines[0]).toContain('دسترسی')
    expect(lines.some((l) => l.includes('روز'))).toBe(true)
    expect(lines.some((l) => l.includes('جلسه'))).toBe(true)
    expect(lines).toContain('شامل کمد')
  })

  it('mountPublicPlans renders names and prices from mock fetch', async () => {
    const grid = document.createElement('div')
    document.body.appendChild(grid)
    await mountPublicPlans(grid, null, {
      fetchPlans: async () => ({
        items: [
          {
            id: 10,
            name: 'ماهانه سالن',
            description: '۳۰ روز دسترسی',
            duration_days: 30,
            session_count: null,
            base_price_toman: 1_500_000,
            includes_locker: false,
          },
          {
            id: 11,
            name: 'سه‌ماهه + کمد',
            description: '۹۰ روز با کمد',
            duration_days: 90,
            session_count: null,
            base_price_toman: 4_000_000,
            includes_locker: true,
          },
          {
            id: 12,
            name: '۱۲ جلسه مربی',
            description: 'بسته جلسه',
            duration_days: 60,
            session_count: 12,
            base_price_toman: 3_600_000,
            includes_locker: false,
          },
        ],
      }),
    })
    expect(grid.textContent).toContain('ماهانه سالن')
    expect(grid.textContent).toContain('سه‌ماهه + کمد')
    expect(grid.textContent).toContain('تومان')
    expect(grid.querySelector('.plan.featured')).toBeTruthy()
    expect(grid.querySelector('[data-plan-id="11"]')?.classList.contains('featured')).toBe(true)
    expect(grid.innerHTML).not.toContain('۱٬۲۰۰٬۰۰۰')
    const card = grid.querySelector('[data-plan-id="11"]')
    expect(card?.querySelector('.plan-body')).toBeTruthy()
    expect(card?.querySelector('.plan-body + .btn, .plan-body + a.btn')).toBeTruthy()
  })

  it('mountPublicPlans shows Persian error when API fails', async () => {
    const grid = document.createElement('div')
    const status = document.createElement('p')
    document.body.appendChild(grid)
    document.body.appendChild(status)
    await mountPublicPlans(grid, status, {
      fetchPlans: async () => {
        throw new Error('network down')
      },
    })
    expect(status.hidden).toBe(false)
    expect(status.textContent).toMatch(/میز پذیرش|در دسترس/)
    expect(grid.querySelector('.plan')).toBeNull()
  })

  it('renderPublicPlanCards empty state has no fake prices', () => {
    const html = renderPublicPlanCards([], null)
    expect(html).toContain('میز پذیرش')
    expect(html).not.toContain('تومان')
  })
})
