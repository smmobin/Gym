import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

vi.mock('../assets/js/members.js', () => ({
  bindMemberSearch: vi.fn(),
}))

vi.mock('../assets/js/ui.js', () => ({
  setStatus: vi.fn(),
}))

vi.mock('../assets/js/api.js', () => ({
  ApiError: class ApiError extends Error {
    /** @param {number} status @param {string} message */
    constructor(status, message) {
      super(message)
      this.status = status
    }
  },
  apiGet: vi.fn(),
  apiPost: vi.fn(),
}))

import { apiGet, apiPost } from '../assets/js/api.js'
import {
  eligibleMembersHintHtml,
  ineligibleLockerAssignMessage,
  lockerPlanNames,
  lockersTableRowsHtml,
  membershipEligibilityHtml,
  mountLockers,
} from '../assets/js/lockers.js'

describe('locker UX helpers (BUG-001)', () => {
  it('lists locker-including plan names', () => {
    expect(
      lockerPlanNames([
        { name: 'ماهانه', includes_locker: false },
        { name: 'سه‌ماهه + کمد', includes_locker: true },
      ]),
    ).toEqual(['سه‌ماهه + کمد'])
  })

  it('builds clear ineligible assign message with next step', () => {
    const msg = ineligibleLockerAssignMessage({
      memberLabel: 'علی رضایی',
      planNames: ['سه‌ماهه + کمد'],
    })
    expect(msg).toContain('علی رضایی')
    expect(msg).toContain('شامل‌کمد')
    expect(msg).toContain('#billing')
    expect(msg).toContain('سه‌ماهه + کمد')
  })

  it('marks memberships واجد / بدون کمد', () => {
    const html = membershipEligibilityHtml(
      [
        { id: 1, plan_id: 10, plan_name: 'ماهانه', status: 'active', start_date: '2026-01-01', end_date: '2026-02-01' },
        { id: 2, plan_id: 20, plan_name: 'سه‌ماهه + کمد', status: 'active', start_date: '2026-01-01', end_date: '2026-04-01' },
      ],
      new Set([20]),
    )
    expect(html).toContain('واجد کمد')
    expect(html).toContain('بدون کمد')
    expect(html).toContain('سه‌ماهه + کمد')
  })

  it('renders eligible members hint list', () => {
    const html = eligibleMembersHintHtml([
      { id: 2, display_id: 'M-1002', first_name: 'سارا', last_name: 'محمدی', plan_name: 'سه‌ماهه + کمد' },
    ])
    expect(html).toContain('سارا')
    expect(html).toContain('M-1002')
    expect(html).toContain('واجد شرایط')
  })
})

describe('locker create → table refresh (BUG-003)', () => {
  beforeEach(() => {
    vi.mocked(apiGet).mockReset()
    vi.mocked(apiPost).mockReset()
  })

  afterEach(() => {
    document.body.innerHTML = ''
  })

  it('shows new locker in tbody after create without full page reload', async () => {
    const existing = [
      {
        id: 1,
        code: 'L-01',
        is_free: false,
        is_active: true,
        current_assignment: { member_name: 'سارا' },
      },
    ]
    const created = {
      id: 99,
      code: 'L-QA-01',
      is_free: true,
      is_active: true,
      current_assignment: null,
    }
    let lockersPayload = { items: existing, total: 1 }

    vi.mocked(apiGet).mockImplementation(async (path) => {
      if (String(path).includes('eligible-members')) return { items: [], total: 0 }
      if (String(path).includes('membership-plans')) {
        return {
          items: [{ id: 1, name: 'سه‌ماهه + کمد', includes_locker: true, base_price_toman: 1 }],
          total: 1,
        }
      }
      if (String(path).includes('/lockers')) return lockersPayload
      return { items: [], total: 0 }
    })
    vi.mocked(apiPost).mockImplementation(async () => {
      lockersPayload = { items: [...existing, created], total: 2 }
      return created
    })

    const root = document.createElement('div')
    document.body.appendChild(root)
    mountLockers(root, { role: 'manager' })

    await vi.waitFor(() => {
      expect(root.querySelector('[data-tbody]')?.textContent).toContain('L-01')
    })

    const form = /** @type {HTMLFormElement} */ (root.querySelector('[data-create]'))
    const input = /** @type {HTMLInputElement} */ (form.querySelector('[name=code]'))
    input.value = 'L-QA-01'
    form.dispatchEvent(new Event('submit', { bubbles: true, cancelable: true }))

    await vi.waitFor(() => {
      expect(apiPost).toHaveBeenCalledWith('/api/v1/lockers', { code: 'L-QA-01' })
    })
    await expect(vi.mocked(apiPost).mock.results.at(-1)?.value).resolves.toMatchObject({
      code: 'L-QA-01',
    })
    await vi.waitFor(() => {
      const text = root.querySelector('[data-tbody]')?.textContent || ''
      expect(text).toContain('L-QA-01')
      expect(text).toContain('L-01')
    })
  })
})

describe('lockersTableRowsHtml', () => {
  it('renders free and occupied rows', () => {
    const html = lockersTableRowsHtml([
      { id: 1, code: 'L-01', is_free: true, is_active: true },
      {
        id: 2,
        code: 'L-02',
        is_free: false,
        is_active: true,
        current_assignment: { member_name: 'سارا' },
      },
    ])
    expect(html).toContain('L-01')
    expect(html).toContain('آزاد')
    expect(html).toContain('سارا')
    expect(html).toContain('data-rel="2"')
  })
})
