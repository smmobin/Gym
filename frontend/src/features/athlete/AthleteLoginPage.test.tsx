import { render, screen } from '@testing-library/react'
import { MemoryRouter } from 'react-router-dom'
import { afterEach, describe, expect, it, vi } from 'vitest'

import { AthleteLoginPage } from './AthleteLoginPage'

describe('AthleteLoginPage', () => {
  afterEach(() => {
    vi.unstubAllGlobals()
  })

  it('shows athlete login heading and no-SMS note', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn(async (input: RequestInfo) => {
        const url = String(input)
        if (url.includes('/athlete/auth/me')) {
          return { ok: false, status: 401, json: async () => ({ detail: 'unauthorized' }) }
        }
        return { ok: false, status: 404, json: async () => ({}) }
      }),
    )

    render(
      <MemoryRouter>
        <AthleteLoginPage />
      </MemoryRouter>,
    )

    expect(await screen.findByRole('heading', { name: 'ورود ورزشکار' })).toBeInTheDocument()
    expect(screen.getByText(/پیامک و OTP هنوز فعال نیست/)).toBeInTheDocument()
  })
})
