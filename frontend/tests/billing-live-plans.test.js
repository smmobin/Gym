import { afterEach, describe, expect, it, vi } from 'vitest'

import { mountBilling } from '../assets/js/billing.js'
import { emitLive, LIVE } from '../assets/js/live-data.js'

describe('mountBilling live plan labels', () => {
  afterEach(() => {
    vi.useRealTimers()
    vi.unstubAllGlobals()
    document.body.innerHTML = ''
  })

  it('refreshes plan dropdown «شامل کمد» when LIVE.PLANS fires', async () => {
    vi.useFakeTimers()
    let includesLocker = false
    const fetchMock = vi.fn(async (url) => {
      const u = String(url)
      if (u.includes('/membership-plans')) {
        return {
          ok: true,
          status: 200,
          json: async () => ({
            items: [
              {
                id: 3218,
                name: '۱۲ جلسه مربی',
                base_price_toman: 3_600_000,
                includes_locker: includesLocker,
                is_active: true,
              },
            ],
          }),
        }
      }
      if (u.includes('/payments/gateway')) {
        return { ok: true, status: 200, json: async () => ({ enabled: false, label: '—' }) }
      }
      return { ok: true, status: 200, json: async () => ({ items: [], total: 0 }) }
    })
    vi.stubGlobal('fetch', fetchMock)

    const section = document.createElement('div')
    section.setAttribute('data-section', 'billing')
    const root = document.createElement('div')
    section.appendChild(root)
    document.body.appendChild(section)

    mountBilling(root, { role: 'manager', id: 1 })
    await vi.advanceTimersByTimeAsync(0)
    await vi.waitFor(() => {
      expect(root.querySelector('[data-plans]')?.innerHTML).toContain('۱۲ جلسه مربی')
    })
    expect(root.querySelector('[data-plans]')?.textContent).not.toContain('شامل کمد')

    includesLocker = true
    emitLive(LIVE.PLANS)
    await vi.advanceTimersByTimeAsync(0)
    await vi.waitFor(() => {
      expect(root.querySelector('[data-plans]')?.textContent).toContain('شامل کمد')
    })
  })

  it('paginates memberships and payments to 5 per page', async () => {
    vi.useFakeTimers()
    const memberships = Array.from({ length: 7 }, (_, i) => ({
      id: 100 + i,
      plan_id: 1,
      plan_name: `طرح ${i + 1}`,
      status: 'pending',
      start_date: '2030-01-01',
      end_date: '2030-02-01',
      agreed_amount_toman: 100000,
    }))
    const payments = Array.from({ length: 8 }, (_, i) => ({
      id: i + 1,
      receipt_number: `R-${i + 1}`,
      amount_toman: 1000,
      method: 'cash',
      status: 'paid',
      membership_id: null,
    }))
    const fetchMock = vi.fn(async (url) => {
      const u = String(url)
      if (u.includes('/membership-plans')) {
        return { ok: true, status: 200, json: async () => ({ items: [], total: 0 }) }
      }
      if (u.includes('/payments/gateway')) {
        return { ok: true, status: 200, json: async () => ({ enabled: false, label: '—' }) }
      }
      if (u.includes('/members?') || (u.includes('/members') && !u.includes('/memberships') && !u.includes('/payments') && !u.includes('/lock'))) {
        return {
          ok: true,
          status: 200,
          json: async () => ({
            items: [
              {
                id: 7,
                display_id: 'M-1007',
                first_name: 'تست',
                last_name: 'بدهی',
                mobile: '09121111007',
                status: 'active',
              },
            ],
            total: 1,
          }),
        }
      }
      if (u.includes('/members/7/memberships')) {
        return {
          ok: true,
          status: 200,
          json: async () => ({
            items: memberships,
            debt_toman: 0,
            freeze_days_used: 0,
            freeze_days_remaining: 14,
          }),
        }
      }
      if (u.includes('/members/7/payments')) {
        return { ok: true, status: 200, json: async () => ({ items: payments, total: payments.length }) }
      }
      if (u.includes('/lock')) {
        return {
          ok: true,
          status: 200,
          json: async () => ({ held_by_me: true, holder_name: 'مدیر', locked_by_name: 'مدیر', expires_at: null }),
        }
      }
      return { ok: true, status: 200, json: async () => ({ items: [], total: 0 }) }
    })
    vi.stubGlobal('fetch', fetchMock)

    const section = document.createElement('div')
    section.setAttribute('data-section', 'billing')
    const root = document.createElement('div')
    section.appendChild(root)
    document.body.appendChild(section)
    mountBilling(root, { role: 'manager', id: 1 })
    await vi.advanceTimersByTimeAsync(0)

    const q = /** @type {HTMLInputElement} */ (root.querySelector('[data-q]'))
    q.value = 'تست'
    q.dispatchEvent(new Event('input', { bubbles: true }))
    await vi.advanceTimersByTimeAsync(400)
    await vi.waitFor(() => expect(root.querySelector('.member-pick-item')).toBeTruthy())
    const pickBtn = /** @type {HTMLButtonElement} */ (root.querySelector('.member-pick-item'))
    pickBtn.dispatchEvent(new MouseEvent('mousedown', { bubbles: true, cancelable: true }))
    pickBtn.click()
    await vi.advanceTimersByTimeAsync(0)
    await vi.waitFor(() => {
      expect(root.querySelector('[data-memberships] .row-item')).toBeTruthy()
    })
    expect(root.querySelectorAll('[data-memberships] .row-item')).toHaveLength(5)
    expect(root.querySelectorAll('[data-payments] .row-item')).toHaveLength(5)
    expect(root.querySelector('[data-memberships-pager]')?.hidden).toBe(false)
    expect(root.querySelector('[data-payments-pager]')?.hidden).toBe(false)
  })

  it('offers پرداخت آزاد and shows membership destination on payment rows', async () => {
    vi.useFakeTimers()
    const fetchMock = vi.fn(async (url) => {
      const u = String(url)
      if (u.includes('/membership-plans')) {
        return { ok: true, status: 200, json: async () => ({ items: [], total: 0 }) }
      }
      if (u.includes('/payments/gateway')) {
        return { ok: true, status: 200, json: async () => ({ enabled: false, label: '—' }) }
      }
      if (u.includes('/members?') || (u.includes('/members') && !u.includes('/memberships') && !u.includes('/payments') && !u.includes('/lock'))) {
        return {
          ok: true,
          status: 200,
          json: async () => ({
            items: [
              {
                id: 7,
                display_id: 'M-1007',
                first_name: 'تست',
                last_name: 'بدهی',
                mobile: '09121111007',
                status: 'pending',
              },
            ],
            total: 1,
          }),
        }
      }
      if (u.includes('/members/7/memberships')) {
        return {
          ok: true,
          status: 200,
          json: async () => ({
            items: [
              { id: 6533, plan_id: 1, plan_name: '۸ جلسه کلاس گروهی', status: 'pending' },
              { id: 100, plan_id: 2, plan_name: 'ماهانه', status: 'active' },
            ],
            debt_toman: 250000,
            freeze_days_used: 0,
            freeze_days_remaining: 14,
          }),
        }
      }
      if (u.includes('/members/7/payments')) {
        return {
          ok: true,
          status: 200,
          json: async () => ({
            items: [
              {
                id: 9,
                receipt_number: 'R-10009',
                amount_toman: 1_200_000,
                method: 'cash',
                status: 'paid',
                membership_id: 6533,
              },
            ],
            total: 1,
            debt_toman: 250000,
          }),
        }
      }
      if (u.includes('/lock')) {
        return {
          ok: true,
          status: 200,
          json: async () => ({
            held_by_me: true,
            holder_name: 'مدیر',
            locked_by_name: 'مدیر',
            expires_at: null,
          }),
        }
      }
      return { ok: true, status: 200, json: async () => ({ items: [], total: 0 }) }
    })
    vi.stubGlobal('fetch', fetchMock)

    const section = document.createElement('div')
    section.setAttribute('data-section', 'billing')
    const root = document.createElement('div')
    section.appendChild(root)
    document.body.appendChild(section)

    mountBilling(root, { role: 'manager', id: 1 })
    await vi.advanceTimersByTimeAsync(0)

    expect(root.querySelector('[data-pay-m]')?.hasAttribute('required')).toBe(true)
    expect(root.textContent).toContain('مقصد پرداخت *')

    const q = /** @type {HTMLInputElement} */ (root.querySelector('[data-q]'))
    q.value = 'تست'
    q.dispatchEvent(new Event('input', { bubbles: true }))
    await vi.advanceTimersByTimeAsync(400)
    await vi.waitFor(() => {
      expect(root.querySelector('.member-pick-item')).toBeTruthy()
    })
    const pickBtn = /** @type {HTMLButtonElement} */ (root.querySelector('.member-pick-item'))
    pickBtn.dispatchEvent(new MouseEvent('mousedown', { bubbles: true, cancelable: true }))
    pickBtn.click()
    await vi.advanceTimersByTimeAsync(0)
    await vi.waitFor(() => {
      expect(root.querySelector('[data-payments]')?.textContent).toContain('R-10009')
    })
    const paySel = /** @type {HTMLSelectElement} */ (root.querySelector('[data-pay-m]'))
    expect([...paySel.options].some((o) => o.value === 'free' && o.textContent?.includes('پرداخت آزاد'))).toBe(
      true,
    )
    expect(root.querySelector('[data-payments]')?.textContent).toContain('مقصد: #6533')
    expect(root.querySelector('[data-payments]')?.textContent).toContain('۸ جلسه کلاس گروهی')
    expect(root.querySelector('[data-payments]')?.textContent).toContain('پرداخت‌شده')
  })

  it('lists pending memberships in پرداخت «عضویت مرتبط» but not in توقف', async () => {
    vi.useFakeTimers()
    const fetchMock = vi.fn(async (url) => {
      const u = String(url)
      if (u.includes('/membership-plans')) {
        return { ok: true, status: 200, json: async () => ({ items: [], total: 0 }) }
      }
      if (u.includes('/payments/gateway')) {
        return { ok: true, status: 200, json: async () => ({ enabled: false, label: '—' }) }
      }
      if (u.includes('/members?') || (u.includes('/members') && !u.includes('/memberships') && !u.includes('/payments'))) {
        return {
          ok: true,
          status: 200,
          json: async () => ({
            items: [
              {
                id: 7,
                display_id: 'M-1007',
                first_name: 'تست',
                last_name: 'بدهی',
                mobile: '09121111007',
                status: 'pending',
              },
            ],
            total: 1,
          }),
        }
      }
      if (u.includes('/members/7/memberships')) {
        return {
          ok: true,
          status: 200,
          json: async () => ({
            items: [
              { id: 6533, plan_id: 1, plan_name: '۸ جلسه کلاس گروهی', status: 'pending' },
              { id: 100, plan_id: 2, plan_name: 'ماهانه', status: 'active' },
              { id: 200, plan_id: 3, plan_name: 'لغو شده', status: 'cancelled' },
            ],
            debt_toman: 250000,
            freeze_days_used: 0,
            freeze_days_remaining: 14,
          }),
        }
      }
      if (u.includes('/members/7/payments')) {
        return { ok: true, status: 200, json: async () => ({ items: [], total: 0 }) }
      }
      if (u.includes('/lock')) {
        return {
          ok: true,
          status: 200,
          json: async () => ({
            held_by_me: true,
            holder_name: 'مدیر',
            locked_by_name: 'مدیر',
            expires_at: null,
          }),
        }
      }
      return { ok: true, status: 200, json: async () => ({ items: [], total: 0 }) }
    })
    vi.stubGlobal('fetch', fetchMock)

    const section = document.createElement('div')
    section.setAttribute('data-section', 'billing')
    const root = document.createElement('div')
    section.appendChild(root)
    document.body.appendChild(section)

    mountBilling(root, { role: 'manager', id: 1 })
    await vi.advanceTimersByTimeAsync(0)

    const q = /** @type {HTMLInputElement} */ (root.querySelector('[data-q]'))
    q.value = 'تست'
    q.dispatchEvent(new Event('input', { bubbles: true }))
    await vi.advanceTimersByTimeAsync(400)
    await vi.waitFor(() => {
      expect(root.querySelector('.member-pick-item')).toBeTruthy()
    })
    const pickBtn = /** @type {HTMLButtonElement} */ (root.querySelector('.member-pick-item'))
    pickBtn.dispatchEvent(new MouseEvent('mousedown', { bubbles: true, cancelable: true }))
    pickBtn.click()
    await vi.advanceTimersByTimeAsync(0)
    await vi.waitFor(() => {
      const payOpts = [...root.querySelectorAll('[data-pay-m] option')].map((o) => o.textContent)
      expect(payOpts.some((t) => t?.includes('#6533') && t.includes('در انتظار'))).toBe(true)
      expect(payOpts.some((t) => t?.includes('#100') && t.includes('فعال'))).toBe(true)
      expect(payOpts.some((t) => t?.includes('لغو'))).toBe(false)
    })
    const freezeOpts = [...root.querySelectorAll('[data-freeze-m] option')].map((o) => o.textContent)
    expect(freezeOpts.some((t) => t?.includes('#6533'))).toBe(false)
    expect(freezeOpts.some((t) => t?.includes('#100'))).toBe(true)
  })
})
