import { render, screen } from '@testing-library/react'
import { MemoryRouter } from 'react-router-dom'
import { afterEach, describe, expect, it, vi } from 'vitest'

import { TrainersPage } from './TrainersPage'

describe('TrainersPage', () => {
  afterEach(() => {
    vi.unstubAllGlobals()
  })

  it('shows trainers heading after auth for manager', async () => {
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
        if (url.includes('/trainers') && !url.includes('/members/')) {
          return {
            ok: true,
            status: 200,
            json: async () => ({
              items: [
                {
                  id: 3,
                  full_name: 'مربی یک',
                  mobile: '09120000003',
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
        <TrainersPage />
      </MemoryRouter>,
    )

    expect(await screen.findByRole('heading', { name: 'مربیان' })).toBeInTheDocument()
    expect(await screen.findByText('مربی یک')).toBeInTheDocument()
    expect(screen.getByText(/واگذاری شاگرد/)).toBeInTheDocument()
  })
})
