import { fireEvent, render, screen } from '@testing-library/react'
import { MemoryRouter } from 'react-router-dom'
import { afterEach, describe, expect, it, vi } from 'vitest'

import { ClassesPage } from './ClassesPage'

describe('ClassesPage', () => {
  afterEach(() => {
    vi.unstubAllGlobals()
  })

  it('shows classes heading and no-show controls for booked member', async () => {
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
        if (url.includes('/bookings') && !url.includes('no-show') && !url.includes('attended')) {
          return {
            ok: true,
            status: 200,
            json: async () => ({
              items: [
                {
                  id: 10,
                  group_class_id: 1,
                  member_id: 6,
                  member_display_id: 'M-1006',
                  member_name: 'مریم جعفری',
                  status: 'booked',
                  created_at: '2026-10-19T06:00:00Z',
                  cancelled_at: null,
                },
              ],
              total: 1,
              booked_count: 1,
              remaining: 11,
            }),
          }
        }
        if (url.includes('/group-classes')) {
          return {
            ok: true,
            status: 200,
            json: async () => ({
              items: [
                {
                  id: 1,
                  title: 'کراس‌فیت صبح',
                  trainer_user_id: null,
                  capacity: 12,
                  booked_count: 1,
                  remaining: 11,
                  gender_label: 'mixed',
                  starts_at: '2026-10-19T06:00:00Z',
                  ends_at: '2026-10-19T07:00:00Z',
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
        <ClassesPage />
      </MemoryRouter>,
    )

    expect(await screen.findByRole('heading', { name: 'کلاس‌های گروهی' })).toBeInTheDocument()
    expect(await screen.findByText('کراس‌فیت صبح')).toBeInTheDocument()
    expect(screen.getByText(/ساخت کلاس جدید/)).toBeInTheDocument()

    fireEvent.click(screen.getByRole('button', { name: 'کراس‌فیت صبح' }))
    expect(await screen.findByRole('button', { name: 'غیبت' })).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'حاضر شد' })).toBeInTheDocument()
  })
})
