import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
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
      if (url.includes('/members') && !url.includes('/lock')) {
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
    expect(screen.getByRole('button', { name: 'ویرایش / قفل' })).toBeInTheDocument()
  })

  it('acquires file lock when selecting a member for edit', async () => {
    const user = userEvent.setup()
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
      if (url.includes('/members/1/lock') && method === 'POST') {
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
      if (url.includes('/members') && method === 'GET') {
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
                notes: null,
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

    await screen.findByRole('button', { name: 'ویرایش / قفل' })
    await user.click(screen.getByRole('button', { name: 'ویرایش / قفل' }))

    expect(await screen.findByText(/قفل پرونده دست شماست/)).toBeInTheDocument()
    expect(screen.getByRole('heading', { name: 'رمز ورود ورزشکار' })).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'ذخیرهٔ ویرایش' })).toBeEnabled()
  })
})
