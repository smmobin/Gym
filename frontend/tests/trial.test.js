import { afterEach, describe, expect, it, vi } from 'vitest'

import { apiPost } from '../assets/js/api.js'

describe('public trial lead', () => {
  afterEach(() => {
    vi.unstubAllGlobals()
  })

  it('happy path posts trial lead', async () => {
    const fetchMock = vi.fn().mockResolvedValue({
      ok: true,
      status: 200,
      json: async () => ({ id: 42, message: 'درخواست ثبت شد.' }),
    })
    vi.stubGlobal('fetch', fetchMock)

    const data = await apiPost('/api/v1/public/trial-leads', {
      full_name: 'علی تست',
      mobile: '09121111999',
      preferred_time_note: 'evening',
      message: null,
    })
    expect(data.id).toBe(42)
    expect(fetchMock).toHaveBeenCalledWith(
      '/api/v1/public/trial-leads',
      expect.objectContaining({
        method: 'POST',
        credentials: 'include',
      }),
    )
  })
})
