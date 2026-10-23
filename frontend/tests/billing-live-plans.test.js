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
})
