import { render, screen } from '@testing-library/react'
import { MemoryRouter } from 'react-router-dom'
import { afterEach, describe, expect, it, vi } from 'vitest'

import { SettingsPage } from './SettingsPage'

describe('SettingsPage', () => {
  afterEach(() => {
    vi.unstubAllGlobals()
  })

  it('shows manager settings form', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn(async (input: RequestInfo) => {
        const url = String(input)
        if (url.includes('/auth/me')) {
          return {
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
          }
        }
        if (url.includes('/gym-settings')) {
          return {
            ok: true,
            status: 200,
            json: async () => ({
              id: 1,
              gym_name: 'باشگاه آذر',
              phone: '021-1',
              address: 'تهران',
              day_end_time: '23:00:00',
              expiry_warning_days: 7,
              freeze_annual_cap_days: 14,
              working_hours_note: '۶ تا ۲۳',
              renewal_rules_note: 'تمدید از پایان',
              updated_at: null,
              created_at: '2026-10-01T00:00:00Z',
            }),
          }
        }
        if (url.includes('/notifications')) {
          return {
            ok: true,
            status: 200,
            json: async () => ({ items: [], total: 0, unread_count: 0 }),
          }
        }
        return { ok: false, status: 404, json: async () => ({}) }
      }),
    )

    render(
      <MemoryRouter>
        <SettingsPage />
      </MemoryRouter>,
    )

    expect(await screen.findByRole('heading', { name: 'تنظیمات باشگاه' })).toBeInTheDocument()
    expect(await screen.findByDisplayValue('باشگاه آذر')).toBeInTheDocument()
  })

  it('blocks receptionist with access message', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn(async (input: RequestInfo) => {
        const url = String(input)
        if (url.includes('/auth/me')) {
          return {
            ok: true,
            status: 200,
            json: async () => ({
              user: {
                id: 2,
                mobile: '09120000002',
                full_name: 'منشی نمونه',
                role: 'receptionist',
                is_active: true,
              },
            }),
          }
        }
        return { ok: false, status: 404, json: async () => ({}) }
      }),
    )

    render(
      <MemoryRouter>
        <SettingsPage />
      </MemoryRouter>,
    )

    expect(await screen.findByRole('heading', { name: 'تنظیمات باشگاه' })).toBeInTheDocument()
    expect(await screen.findByRole('alert')).toHaveTextContent(/فقط برای مدیر/)
  })
})
