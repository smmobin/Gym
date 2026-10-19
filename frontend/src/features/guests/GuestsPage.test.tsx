import { render, screen } from '@testing-library/react'
import { MemoryRouter } from 'react-router-dom'
import { afterEach, describe, expect, it, vi } from 'vitest'

import { GuestsPage } from './GuestsPage'

describe('GuestsPage', () => {
  afterEach(() => {
    vi.unstubAllGlobals()
  })

  it('shows day-guest form for receptionist', async () => {
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
        <GuestsPage />
      </MemoryRouter>,
    )

    expect(await screen.findByRole('heading', { name: 'مهمان روزانه' })).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'ثبت مهمان' })).toBeInTheDocument()
  })
})
