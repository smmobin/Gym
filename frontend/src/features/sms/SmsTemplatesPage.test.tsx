import { render, screen } from '@testing-library/react'
import { MemoryRouter } from 'react-router-dom'
import { afterEach, describe, expect, it, vi } from 'vitest'

import { SmsTemplatesPage } from './SmsTemplatesPage'

describe('SmsTemplatesPage', () => {
  afterEach(() => {
    vi.unstubAllGlobals()
  })

  it('shows templates with disabled send and not-ready text', async () => {
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
        if (url.includes('/notifications')) {
          return {
            ok: true,
            status: 200,
            json: async () => ({ items: [], total: 0, unread_count: 0 }),
          }
        }
        return { ok: false, status: 404, json: async () => ({}) }
      }),
    )

    render(
      <MemoryRouter>
        <SmsTemplatesPage />
      </MemoryRouter>,
    )

    expect(await screen.findByRole('heading', { name: 'قالب پیامک' })).toBeInTheDocument()
    expect(screen.getAllByText('هنوز آماده نیست').length).toBeGreaterThanOrEqual(1)
    const sendButtons = screen.getAllByRole('button', { name: 'ارسال' })
    expect(sendButtons.every((b) => (b as HTMLButtonElement).disabled)).toBe(true)
  })
})
