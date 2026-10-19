import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { MemoryRouter } from 'react-router-dom'
import { afterEach, describe, expect, it, vi } from 'vitest'

import { AthleteHomePage } from './AthleteHomePage'

const me = {
  member: {
    id: 1,
    display_id: 'M-1001',
    first_name: 'علی',
    last_name: 'رضایی',
    mobile: '09121111001',
    status: 'active',
  },
}

function emptyLists() {
  return {
    ok: true,
    status: 200,
    json: async () => ({ items: [], total: 0, debt_toman: 0, unread_count: 0 }),
  }
}

describe('AthleteHomePage classes', () => {
  afterEach(() => {
    vi.unstubAllGlobals()
  })

  it('books and cancels a class (happy path)', async () => {
    const user = userEvent.setup()
    let booked = false
    const fetchMock = vi.fn(async (input: RequestInfo, init?: RequestInit) => {
      const url = String(input)
      const method = (init?.method ?? 'GET').toUpperCase()
      if (url.includes('/athlete/auth/me')) {
        return { ok: true, status: 200, json: async () => me }
      }
      if (url.includes('/athlete/memberships')) return emptyLists()
      if (url.includes('/athlete/payments')) return emptyLists()
      if (url.includes('/athlete/workout-plans')) return emptyLists()
      if (url.includes('/athlete/notifications')) return emptyLists()
      if (url.includes('/athlete/group-classes') && method === 'GET') {
        return {
          ok: true,
          status: 200,
          json: async () => ({
            items: [
              {
                id: 40,
                title: 'پیلاتس عصر',
                trainer_user_id: 3,
                trainer_full_name: 'مربی نمونه',
                capacity: 8,
                booked_count: booked ? 1 : 0,
                remaining: booked ? 7 : 8,
                gender_label: 'mixed',
                starts_at: '2026-10-21T12:00:00Z',
                ends_at: '2026-10-21T13:00:00Z',
                is_active: true,
                booked_by_me: booked,
                my_booking_id: booked ? 99 : null,
              },
            ],
            total: 1,
          }),
        }
      }
      if (url.includes('/athlete/group-classes/40/book') && method === 'POST') {
        booked = true
        return {
          ok: true,
          status: 201,
          json: async () => ({
            booking: {
              id: 99,
              group_class_id: 40,
              class_title: 'پیلاتس عصر',
              status: 'booked',
              starts_at: '2026-10-21T12:00:00Z',
              ends_at: '2026-10-21T13:00:00Z',
              created_at: '2026-10-19T12:00:00Z',
            },
            booked_count: 1,
            remaining: 7,
          }),
        }
      }
      if (url.includes('/athlete/class-bookings/99/cancel') && method === 'POST') {
        booked = false
        return {
          ok: true,
          status: 200,
          json: async () => ({
            booking: {
              id: 99,
              group_class_id: 40,
              class_title: 'پیلاتس عصر',
              status: 'cancelled',
              starts_at: '2026-10-21T12:00:00Z',
              ends_at: '2026-10-21T13:00:00Z',
              created_at: '2026-10-19T12:00:00Z',
            },
            booked_count: 0,
            remaining: 8,
          }),
        }
      }
      return { ok: false, status: 404, json: async () => ({}) }
    })
    vi.stubGlobal('fetch', fetchMock)

    render(
      <MemoryRouter>
        <AthleteHomePage />
      </MemoryRouter>,
    )

    expect(await screen.findByRole('heading', { name: /کلاس‌های گروهی/ })).toBeInTheDocument()
    expect(screen.getByText(/پیلاتس عصر/)).toBeInTheDocument()

    await user.click(screen.getByRole('button', { name: 'رزرو' }))
    expect(await screen.findByText(/رزرو ثبت شد/)).toBeInTheDocument()
    expect(await screen.findByRole('button', { name: 'لغو رزرو' })).toBeInTheDocument()

    await user.click(screen.getByRole('button', { name: 'لغو رزرو' }))
    expect(await screen.findByText(/رزرو لغو شد/)).toBeInTheDocument()
  })

  it('shows capacity error when book returns 409', async () => {
    const user = userEvent.setup()
    const fetchMock = vi.fn(async (input: RequestInfo, init?: RequestInit) => {
      const url = String(input)
      const method = (init?.method ?? 'GET').toUpperCase()
      if (url.includes('/athlete/auth/me')) {
        return { ok: true, status: 200, json: async () => me }
      }
      if (
        url.includes('/athlete/memberships') ||
        url.includes('/athlete/payments') ||
        url.includes('/athlete/workout-plans') ||
        url.includes('/athlete/notifications')
      ) {
        return emptyLists()
      }
      if (url.includes('/athlete/group-classes') && method === 'GET') {
        return {
          ok: true,
          status: 200,
          json: async () => ({
            items: [
              {
                id: 41,
                title: 'کلاس پر',
                trainer_user_id: null,
                trainer_full_name: null,
                capacity: 1,
                booked_count: 1,
                remaining: 1,
                gender_label: 'mixed',
                starts_at: '2026-10-22T10:00:00Z',
                ends_at: '2026-10-22T11:00:00Z',
                is_active: true,
                booked_by_me: false,
                my_booking_id: null,
              },
            ],
            total: 1,
          }),
        }
      }
      if (url.includes('/book') && method === 'POST') {
        return {
          ok: false,
          status: 409,
          json: async () => ({ detail: 'ظرفیت کلاس تکمیل است.' }),
        }
      }
      return { ok: false, status: 404, json: async () => ({}) }
    })
    vi.stubGlobal('fetch', fetchMock)

    render(
      <MemoryRouter>
        <AthleteHomePage />
      </MemoryRouter>,
    )

    await screen.findByText(/کلاس پر/)
    await user.click(screen.getByRole('button', { name: 'رزرو' }))
    expect(await screen.findByRole('alert')).toHaveTextContent(/ظرفیت/)
  })
})
