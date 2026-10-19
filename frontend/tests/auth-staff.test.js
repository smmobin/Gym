import { afterEach, describe, expect, it, vi } from 'vitest'

import { staffLogin } from '../assets/js/auth-staff.js'

describe('staff login', () => {
  afterEach(() => {
    vi.unstubAllGlobals()
  })

  it('happy path returns user from login API', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn().mockResolvedValue({
        ok: true,
        status: 200,
        json: async () => ({
          user: {
            id: 1,
            mobile: '09120000001',
            full_name: 'مدیر نمونه',
            role: 'manager',
            is_active: true,
          },
        }),
      }),
    )

    const user = await staffLogin('09120000001', 'ChangeMe123')
    expect(user.role).toBe('manager')
    expect(user.full_name).toBe('مدیر نمونه')
  })
})
