import { render, screen } from '@testing-library/react'
import { MemoryRouter } from 'react-router-dom'
import { afterEach, describe, expect, it, vi } from 'vitest'

import { ReportsPage } from './ReportsPage'

describe('ReportsPage', () => {
  afterEach(() => {
    vi.unstubAllGlobals()
  })

  it('shows manager finance heading and summary', async () => {
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
        if (url.includes('/reports/profit')) {
          return {
            ok: true,
            status: 200,
            json: async () => ({
              from: '2026-10-01',
              to: '2026-10-31',
              income_paid_toman: 1_000_000,
              expenses_toman: 400_000,
              profit_toman: 600_000,
              note: 'بدهی ≠ درآمد؛ فقط پرداخت‌های paid در درآمد آمده‌اند.',
            }),
          }
        }
        if (url.includes('/expenses')) {
          return {
            ok: true,
            status: 200,
            json: async () => ({
              items: [],
              total: 0,
              from: '2026-10-01',
              to: '2026-10-31',
              expenses_toman: 0,
            }),
          }
        }
        return { ok: false, status: 404, json: async () => ({}) }
      }),
    )

    render(
      <MemoryRouter>
        <ReportsPage />
      </MemoryRouter>,
    )

    expect(await screen.findByRole('heading', { name: 'گزارش هزینه و سود' })).toBeInTheDocument()
    expect(await screen.findByText(/سود نمایشی/)).toBeInTheDocument()
    expect(screen.getAllByText(/بدهی ≠ درآمد/).length).toBeGreaterThanOrEqual(1)
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
        <ReportsPage />
      </MemoryRouter>,
    )

    expect(await screen.findByText(/فقط برای مدیر/)).toBeInTheDocument()
  })
})
