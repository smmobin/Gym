import { render, screen } from '@testing-library/react'
import { MemoryRouter } from 'react-router-dom'
import { afterEach, describe, expect, it, vi } from 'vitest'

import { LockersPage } from './LockersPage'

describe('LockersPage', () => {
  afterEach(() => {
    vi.unstubAllGlobals()
  })

  it('shows lockers heading after auth for manager', async () => {
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
        if (url.includes('/lockers')) {
          return {
            ok: true,
            status: 200,
            json: async () => ({
              items: [
                {
                  id: 1,
                  code: 'L-01',
                  is_active: true,
                  is_free: false,
                  current_assignment: {
                    id: 1,
                    member_id: 2,
                    member_display_id: 'M-1002',
                    member_name: 'سارا محمدی',
                    membership_id: 1,
                    assigned_at: '2026-10-01T10:00:00Z',
                    released_at: null,
                    note: null,
                  },
                },
                {
                  id: 2,
                  code: 'L-02',
                  is_active: true,
                  is_free: true,
                  current_assignment: null,
                },
              ],
              total: 2,
            }),
          }
        }
        return { ok: false, status: 404, json: async () => ({}) }
      }),
    )

    render(
      <MemoryRouter>
        <LockersPage />
      </MemoryRouter>,
    )

    expect(await screen.findByRole('heading', { name: 'کمدها' })).toBeInTheDocument()
    expect(await screen.findByText('L-01')).toBeInTheDocument()
    expect(screen.getByText(/ساخت کمد جدید/)).toBeInTheDocument()
  })
})
