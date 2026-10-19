import { render, screen } from '@testing-library/react'
import { MemoryRouter } from 'react-router-dom'
import { afterEach, describe, expect, it, vi } from 'vitest'

import { MembersPage } from './MembersPage'

describe('MembersPage', () => {
  afterEach(() => {
    vi.unstubAllGlobals()
  })

  it('loads members after auth and shows create form for manager', async () => {
    const fetchMock = vi.fn(async (input: RequestInfo) => {
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
      if (url.includes('/members')) {
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
      return { ok: false, status: 404, json: async () => ({}) }
    })
    vi.stubGlobal('fetch', fetchMock)

    render(
      <MemoryRouter>
        <MembersPage />
      </MemoryRouter>,
    )

    expect(await screen.findByRole('heading', { name: 'اعضا' })).toBeInTheDocument()
    expect((await screen.findAllByText(/علی رضایی/)).length).toBeGreaterThanOrEqual(1)
    expect(screen.getByRole('heading', { name: 'ثبت عضو جدید' })).toBeInTheDocument()
    expect(screen.getByRole('heading', { name: 'رمز ورود ورزشکار' })).toBeInTheDocument()
  })
})
