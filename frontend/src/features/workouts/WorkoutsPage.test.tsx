import { render, screen } from '@testing-library/react'
import { MemoryRouter } from 'react-router-dom'
import { afterEach, describe, expect, it, vi } from 'vitest'

import { WorkoutsPage } from './WorkoutsPage'

describe('WorkoutsPage', () => {
  afterEach(() => {
    vi.unstubAllGlobals()
  })

  it('shows workout heading and trainees for trainer', async () => {
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
                id: 3,
                mobile: '09120000003',
                full_name: 'مربی یک',
                role: 'trainer',
                is_active: true,
              },
            }),
          }
        }
        if (url.includes('/members') && !url.includes('workout-plans')) {
          return {
            ok: true,
            status: 200,
            json: async () => ({
              items: [
                {
                  id: 4,
                  display_id: 'M-1004',
                  first_name: 'نگار',
                  last_name: 'احمدی',
                  mobile: '09121111004',
                  status: 'active',
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
        <WorkoutsPage />
      </MemoryRouter>,
    )

    expect(await screen.findByRole('heading', { name: 'برنامه تمرینی' })).toBeInTheDocument()
    expect(await screen.findByText(/M-1004/)).toBeInTheDocument()
  })
})
