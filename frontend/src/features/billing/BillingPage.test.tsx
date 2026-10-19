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
})
