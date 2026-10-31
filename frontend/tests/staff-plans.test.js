import { afterEach, describe, expect, it, vi } from 'vitest'

import { mountPlans } from '../assets/js/plans.js'
import { mountStaff } from '../assets/js/staff.js'

/** @returns {HTMLElement | null} */
function latestToast() {
  const host = document.getElementById('gym-toast-host')
  const list = host?.querySelectorAll('.gym-toast')
  if (!list?.length) return null
  return /** @type {HTMLElement} */ (list[list.length - 1])
}

describe('mountStaff / mountPlans', () => {
  afterEach(() => {
    vi.useRealTimers()
    vi.unstubAllGlobals()
    document.getElementById('gym-toast-host')?.remove()
    document.body.innerHTML = ''
  })

  it('mountStaff manager shows create form for receptionist and trainer', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn().mockResolvedValue({
        ok: true,
        status: 200,
        json: async () => ({
          items: [
            {
              id: 1,
              mobile: '09120000001',
              full_name: 'مدیر',
              role: 'manager',
              is_active: true,
            },
            {
              id: 3,
              mobile: '09120000003',
              full_name: 'مربی',
              role: 'trainer',
              is_active: true,
            },
          ],
          total: 2,
        }),
      }),
    )
    const root = document.createElement('div')
    document.body.appendChild(root)
    mountStaff(root, { role: 'manager', id: 1 })
    await vi.waitFor(() => {
      expect(root.querySelector('[data-create]')).toBeTruthy()
    })
    const roleSelect = root.querySelector('[data-create] [name=role]')
    expect(roleSelect.innerHTML).toContain('receptionist')
    expect(roleSelect.innerHTML).toContain('trainer')
    expect(root.textContent).not.toContain('حذف = غیرفعال')
    expect(root.querySelector('[data-deactivate]')).toBeNull()
    expect(root.querySelector('[data-activate]')).toBeNull()
    expect(root.querySelector('[data-reload]')).toBeNull()
    expect(root.textContent).not.toContain('بازخوانی')
  })

  it('mountStaff create 201 shows success not ثبت ناموفق', async () => {
    const fetchMock = vi.fn(async (url, opts) => {
      const method = (opts?.method || 'GET').toUpperCase()
      if (method === 'POST' && String(url).includes('/api/v1/staff')) {
        return {
          ok: true,
          status: 201,
          json: async () => ({
            user: {
              id: 9,
              mobile: '09129999099',
              full_name: 'منشی جدید',
              role: 'receptionist',
              is_active: true,
            },
          }),
        }
      }
      return {
        ok: true,
        status: 200,
        json: async () => ({
          items: [
            {
              id: 9,
              mobile: '09129999099',
              full_name: 'منشی جدید',
              role: 'receptionist',
              is_active: true,
            },
          ],
          total: 1,
        }),
      }
    })
    vi.stubGlobal('fetch', fetchMock)
    const root = document.createElement('div')
    document.body.appendChild(root)
    mountStaff(root, { role: 'manager', id: 1 })
    await vi.waitFor(() => expect(root.querySelector('[data-create]')).toBeTruthy())

    const form = /** @type {HTMLFormElement} */ (root.querySelector('[data-create]'))
    /** @param {string} name @param {string} value */
    const set = (name, value) => {
      const el = form.querySelector(`[name="${name}"]`)
      if (el instanceof HTMLInputElement || el instanceof HTMLSelectElement) el.value = value
    }
    set('full_name', 'منشی جدید')
    set('mobile', '09129999099')
    set('role', 'receptionist')
    set('password', 'Password12')
    form.requestSubmit()

    await vi.waitFor(() => {
      const toast = latestToast()
      expect(toast?.textContent || '').not.toContain('ثبت ناموفق')
      expect(toast?.className).toMatch(/ok/)
    })
    expect(latestToast()?.textContent || '').not.toMatch(/ناموفق/)
  })

  it('mountStaff receptionist only offers trainer role', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn().mockResolvedValue({
        ok: true,
        status: 200,
        json: async () => ({
          items: [
            {
              id: 3,
              mobile: '09120000003',
              full_name: 'مربی',
              role: 'trainer',
              is_active: true,
            },
          ],
          total: 1,
        }),
      }),
    )
    const root = document.createElement('div')
    document.body.appendChild(root)
    mountStaff(root, { role: 'receptionist', id: 2 })
    await vi.waitFor(() => {
      expect(root.querySelector('[data-create]')).toBeTruthy()
    })
    const roleSelect = root.querySelector('[data-create] [name=role]')
    expect(roleSelect.innerHTML).toContain('trainer')
    expect(roleSelect.innerHTML).not.toContain('receptionist')
  })

  it('mountPlans create success is not overwritten by refresh TypeError', async () => {
    const fetchMock = vi.fn(async (url, opts) => {
      const method = (opts?.method || 'GET').toUpperCase()
      if (method === 'POST' && String(url).includes('/membership-plans')) {
        return {
          ok: true,
          status: 201,
          json: async () => ({
            plan: {
              id: 9,
              name: 'طرح تست',
              duration_days: 30,
              session_count: null,
              base_price_toman: 1_500_000,
              includes_locker: false,
              is_active: true,
            },
          }),
        }
      }
      return {
        ok: true,
        status: 200,
        json: async () => ({
          items: [
            {
              id: 9,
              name: 'طرح تست',
              duration_days: 30,
              session_count: null,
              base_price_toman: 1_500_000,
              includes_locker: false,
              is_active: true,
            },
          ],
          total: 1,
        }),
      }
    })
    vi.stubGlobal('fetch', fetchMock)
    const root = document.createElement('div')
    document.body.appendChild(root)
    mountPlans(root, { role: 'manager' })
    await vi.waitFor(() => expect(root.querySelector('[data-create]')).toBeTruthy())

    const form = /** @type {HTMLFormElement} */ (root.querySelector('[data-create]'))
    const name = form.querySelector('[name=name]')
    const days = form.querySelector('[name=duration_days]')
    const price = form.querySelector('[name=base_price_toman]')
    if (name instanceof HTMLInputElement) name.value = 'طرح تست'
    if (days instanceof HTMLInputElement) days.value = '30'
    if (price instanceof HTMLInputElement) {
      price.value = '1500000'
      price.dispatchEvent(new Event('input', { bubbles: true }))
    }
    form.requestSubmit()

    await vi.waitFor(() => {
      const toast = latestToast()
      expect(toast?.textContent || '').not.toMatch(/is not a function/i)
      expect(toast?.className).toMatch(/ok/)
    })
    expect(root.querySelector('[data-tbody]')?.textContent).toContain('طرح تست')
  })

  it('mountPlans loads include_inactive without manual reload button', async () => {
    const fetchMock = vi.fn().mockResolvedValue({
      ok: true,
      status: 200,
      json: async () => ({
        items: [
          {
            id: 1,
            name: 'ماهانه',
            duration_days: 30,
            session_count: null,
            base_price_toman: 1000000,
            includes_locker: false,
            is_active: true,
          },
          {
            id: 2,
            name: 'قدیمی',
            duration_days: 30,
            session_count: null,
            base_price_toman: 500000,
            includes_locker: false,
            is_active: false,
          },
        ],
        total: 2,
      }),
    })
    vi.stubGlobal('fetch', fetchMock)
    const root = document.createElement('div')
    document.body.appendChild(root)
    mountPlans(root, { role: 'manager' })
    await vi.waitFor(() => {
      expect(root.querySelector('[data-tbody]')?.textContent).toContain('ماهانه')
    })
    expect(fetchMock.mock.calls[0][0]).toContain('include_inactive=1')
    expect(root.textContent).not.toContain('حذف = غیرفعال')
    expect(root.textContent).not.toContain('بازخوانی')
    expect(root.querySelector('[data-reload]')).toBeNull()
    expect(root.textContent).toContain('شامل کمد')
    expect(root.textContent).toContain('غیرفعال')
    const lockerLabels = root.querySelectorAll('label.check input[name="includes_locker"]')
    expect(lockerLabels.length).toBe(2)
    lockerLabels.forEach((input) => {
      expect(input.closest('label')?.classList.contains('full')).toBe(false)
    })
  })

  it('mountPlans auto-retries after network error', async () => {
    vi.useFakeTimers({ shouldAdvanceTime: true })
    let calls = 0
    const fetchMock = vi.fn(async () => {
      calls += 1
      if (calls === 1) {
        return { ok: false, status: 503, json: async () => ({ detail: 'unavailable' }) }
      }
      return {
        ok: true,
        status: 200,
        json: async () => ({
          items: [
            {
              id: 1,
              name: 'ماهانه',
              duration_days: 30,
              session_count: null,
              base_price_toman: 1000000,
              includes_locker: false,
              is_active: true,
            },
          ],
          total: 1,
        }),
      }
    })
    vi.stubGlobal('fetch', fetchMock)
    const root = document.createElement('div')
    document.body.appendChild(root)
    mountPlans(root, { role: 'manager' })

    await vi.waitFor(() => {
      expect(latestToast()?.className).toMatch(/error/)
    })
    expect(latestToast()?.textContent || '').toMatch(/تلاش مجدد|ناموفق|unavailable/i)

    await vi.advanceTimersByTimeAsync(2_500)
    await vi.waitFor(() => {
      expect(root.querySelector('[data-tbody]')?.textContent).toContain('ماهانه')
    })
    // Load success no longer toasts «N طرح»; leftover error may still auto-dismiss.
    expect(latestToast()?.textContent || '').not.toMatch(/طرح/)
    vi.clearAllTimers()
  })
})
