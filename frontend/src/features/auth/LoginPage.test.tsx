import { render, screen } from '@testing-library/react'
import { MemoryRouter } from 'react-router-dom'
import { afterEach, describe, expect, it, vi } from 'vitest'

import { LoginPage } from './LoginPage'

describe('LoginPage', () => {
  afterEach(() => {
    vi.unstubAllGlobals()
  })

  it('shows Persian login form when not authenticated', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn().mockResolvedValue({
        ok: false,
        status: 401,
        json: async () => ({ detail: 'unauthorized' }),
      }),
    )

    render(
      <MemoryRouter>
        <LoginPage />
      </MemoryRouter>,
    )

    expect(screen.getByRole('heading', { name: 'ورود کارکنان' })).toBeInTheDocument()
    expect(screen.getByLabelText('موبایل')).toBeInTheDocument()
    expect(screen.getByLabelText('رمز عبور')).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'ورود' })).toBeInTheDocument()
  })
})
