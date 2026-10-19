import { render, screen } from '@testing-library/react'
import { MemoryRouter } from 'react-router-dom'
import { afterEach, describe, expect, it, vi } from 'vitest'

import { BillingPage } from './BillingPage'

describe('BillingPage', () => {
  afterEach(() => {
    vi.unstubAllGlobals()
  })

  it('shows billing heading after auth for manager', async () => {
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
        if (url.includes('/membership-plans')) {
          return {
            ok: true,
            status: 200,
            json: async () => ({
              items: [
                {
                  id: 1,
                  name: 'ماهانه',
                  description: null,
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
        }
        return { ok: false, status: 404, json: async () => ({}) }
      }),
    )

    render(
      <MemoryRouter>
        <BillingPage />
      </MemoryRouter>,
    )

    expect(await screen.findByRole('heading', { name: 'مالی و تمدید' })).toBeInTheDocument()
    expect(screen.getByText(/تمدید اشتراک/)).toBeInTheDocument()
  })

  it('shows freeze controls after selecting a member', async () => {
    const fetchMock = vi.fn(async (input: RequestInfo, init?: RequestInit) => {
      const url = String(input)
      const method = (init?.method ?? 'GET').toUpperCase()
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
      if (url.includes('/membership-plans')) {
        return {
          ok: true,
          status: 200,
          json: async () => ({ items: [], total: 0 }),
        }
      }
      if (url.includes('/members?') || (url.includes('/members') && !url.includes('/memberships') && !url.includes('/payments') && !url.includes('/lock') && method === 'GET')) {
        return {
          ok: true,
          status: 200,
          json: async () => ({
            items: [
              {
                id: 1,
                display_id: 'M-1001',
                first_name: 'علی',
                last_name: 'رضایی',
                mobile: '09121111001',
                status: 'active',
                created_at: '2026-01-01T00:00:00Z',
              },
            ],
            total: 1,
          }),
        }
      }
      if (url.includes('/memberships')) {
        return {
          ok: true,
          status: 200,
          json: async () => ({
            items: [
              {
                id: 10,
                member_id: 1,
                plan_id: 1,
                plan_name: 'ماهانه',
                agreed_amount_toman: 1_000_000,
                start_date: '2026-10-01',
                end_date: '2026-10-31',
                status: 'active',
                sessions_remaining: null,
                freeze_started_at: null,
                freeze_ends_at: null,
                freeze_days_used: 0,
                remaining_freeze_days_this_year: 14,
                notes: null,
                created_at: '2026-10-01T00:00:00Z',
              },
            ],
            total: 1,
            debt_toman: 0,
            freeze_annual_cap_days: 14,
            freeze_days_used_member: 0,
            remaining_freeze_days_this_year: 14,
            freeze_cap_year: 2026,
          }),
        }
      }
      if (url.includes('/payments')) {
        return {
          ok: true,
          status: 200,
          json: async () => ({ items: [], total: 0, debt_toman: 0 }),
        }
      }
      if (url.includes('/lock')) {
        return {
          ok: true,
          status: 200,
          json: async () => ({
            locked: true,
            member_id: 1,
            locked_by: 1,
            locked_by_name: 'مدیر نمونه',
            locked_by_mobile: '09120000001',
            acquired_at: '2026-01-01T00:00:00Z',
            last_seen_at: '2026-01-01T00:00:00Z',
            expires_at: '2026-01-01T00:05:00Z',
            held_by_me: true,
          }),
        }
      }
      return { ok: false, status: 404, json: async () => ({}) }
    })
    vi.stubGlobal('fetch', fetchMock)

    const { default: userEvent } = await import('@testing-library/user-event')
    const user = userEvent.setup()

    render(
      <MemoryRouter>
        <BillingPage />
      </MemoryRouter>,
    )

    await screen.findByRole('heading', { name: 'مالی و تمدید' })
    await user.type(screen.getByPlaceholderText('نام یا موبایل'), 'علی')
    await user.click(screen.getByRole('button', { name: 'جستجو' }))
    await user.click(await screen.findByRole('button', { name: /علی رضایی/ }))

    expect(await screen.findByRole('heading', { name: /توقف عضویت/ })).toBeInTheDocument()
    expect(screen.getByText(/سقف توقف سالانه/)).toBeInTheDocument()
  })
})
