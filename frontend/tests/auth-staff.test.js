import { afterEach, describe, expect, it, vi } from 'vitest'

import {
  panelPathForRole,
  resolvePostLoginPath,
  staffLogin,
  unifiedLogin,
} from '../assets/js/auth-staff.js'

describe('unified login helpers', () => {
  afterEach(() => {
    vi.unstubAllGlobals()
  })

  it('unifiedLogin returns kind+role and can send identity', async () => {
    const fetchMock = vi.fn().mockResolvedValue({
      ok: true,
      status: 200,
      json: async () => ({
        kind: 'staff',
        role: 'receptionist',
        user: {
          id: 2,
          mobile: '09120000002',
          full_name: 'منشی نمونه',
          role: 'receptionist',
          is_active: true,
        },
        member: null,
      }),
    })
    vi.stubGlobal('fetch', fetchMock)

    const result = await unifiedLogin('09120000002', 'ChangeMe123', {
      kind: 'staff',
      role: 'receptionist',
    })
    expect(result.kind).toBe('staff')
    expect(result.role).toBe('receptionist')
    const [, init] = fetchMock.mock.calls[0]
    expect(JSON.parse(init.body)).toMatchObject({
      mobile: '09120000002',
      kind: 'staff',
      role: 'receptionist',
    })
  })

  it('staffLogin happy path returns user', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn().mockResolvedValue({
        ok: true,
        status: 200,
        json: async () => ({
          kind: 'staff',
          role: 'manager',
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

  it('panelPathForRole maps trainer to /trainer/', () => {
    expect(panelPathForRole('manager')).toBe('/manager/')
    expect(panelPathForRole('receptionist')).toBe('/receptionist/')
    expect(panelPathForRole('trainer')).toBe('/trainer/')
    expect(panelPathForRole('athlete')).toBe('/athlete/')
  })

  it('resolvePostLoginPath ignores manager next for receptionist', () => {
    const path = resolvePostLoginPath(
      { kind: 'staff', role: 'receptionist' },
      '/manager/',
    )
    expect(path).toBe('/receptionist/')
  })

  it('resolvePostLoginPath ignores receptionist next for manager', () => {
    expect(
      resolvePostLoginPath({ kind: 'staff', role: 'manager' }, '/receptionist/'),
    ).toBe('/manager/')
  })

  it('resolvePostLoginPath sends athlete home', () => {
    expect(
      resolvePostLoginPath({ kind: 'athlete', role: 'athlete' }, '/receptionist/'),
    ).toBe('/athlete/')
  })
})
