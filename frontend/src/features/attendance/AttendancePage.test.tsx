import { render, screen } from '@testing-library/react'
import { MemoryRouter } from 'react-router-dom'
import { afterEach, describe, expect, it, vi } from 'vitest'

import { AttendancePage } from './AttendancePage'

describe('AttendancePage', () => {
  afterEach(() => {
    vi.unstubAllGlobals()
  })

  it('shows attendance heading after auth', async () => {
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
        if (url.includes('/attendances/today')) {
          return {
            ok: true,
            status: 200,
            json: async () => ({ items: [], total: 0, auto_closed_attendance_ids: [] }),
          }
        }
        return { ok: false, status: 404, json: async () => ({}) }
      }),
    )

    render(
      <MemoryRouter>
        <AttendancePage />
      </MemoryRouter>,
    )

    expect(await screen.findByRole('heading', { name: 'حضور و غیاب' })).toBeInTheDocument()
    expect(screen.getByText(/حضور امروز/)).toBeInTheDocument()
  })
})
