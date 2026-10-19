import { afterEach, describe, expect, it, vi } from 'vitest'

import { apiPost } from '../assets/js/api.js'

describe('athlete class book', () => {
  afterEach(() => {
    vi.unstubAllGlobals()
  })

  it('happy path books a class', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn().mockResolvedValue({
        ok: true,
        status: 200,
        json: async () => ({
          booking: { id: 7, status: 'booked' },
          remaining: 5,
        }),
      }),
    )

    const res = await apiPost('/api/v1/athlete/group-classes/3/book')
    expect(res.remaining).toBe(5)
    expect(res.booking.status).toBe('booked')
  })

  it('surfaces 403 for unauthorized', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn().mockResolvedValue({
        ok: false,
        status: 403,
        json: async () => ({ detail: 'فقط برای ورزشکار لاگین‌شده.' }),
      }),
    )

    await expect(apiPost('/api/v1/athlete/group-classes/3/book')).rejects.toMatchObject({
      status: 403,
    })
  })
})
