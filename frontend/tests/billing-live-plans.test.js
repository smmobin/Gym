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
      expect(payOpts.some((t) => t?.includes('#6533') && t.includes('pending'))).toBe(true)
      expect(payOpts.some((t) => t?.includes('#100') && t.includes('active'))).toBe(true)
      expect(payOpts.some((t) => t?.includes('cancelled'))).toBe(false)
    })
    const freezeOpts = [...root.querySelectorAll('[data-freeze-m] option')].map((o) => o.textContent)
    expect(freezeOpts.some((t) => t?.includes('#6533'))).toBe(false)
    expect(freezeOpts.some((t) => t?.includes('#100'))).toBe(true)
  })
})
