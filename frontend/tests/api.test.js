import { afterEach, describe, expect, it, vi } from 'vitest'

import { ApiError, apiGet, apiPost } from '../assets/js/api.js'

describe('api client', () => {
  afterEach(() => {
    vi.unstubAllGlobals()
  })

  it('returns JSON when response is ok (happy path)', async () => {
    const fetchMock = vi.fn().mockResolvedValue({
      ok: true,
      status: 200,
      json: async () => ({ status: 'ok' }),
    })
    vi.stubGlobal('fetch', fetchMock)

    await expect(apiGet('/api/v1/health')).resolves.toEqual({ status: 'ok' })
    expect(fetchMock).toHaveBeenCalledWith(
      '/api/v1/health',
      expect.objectContaining({ credentials: 'include' }),
    )
  })

  it('throws ApiError on 401', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn().mockResolvedValue({
        ok: false,
        status: 401,
        json: async () => ({ detail: 'موبایل یا رمز نادرست است.' }),
      }),
    )

    await expect(apiPost('/api/v1/auth/login', { mobile: 'x', password: 'y' })).rejects.toMatchObject({
      name: 'ApiError',
      status: 401,
      message: 'موبایل یا رمز نادرست است.',
    })
  })

  it('throws ApiError on 403', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn().mockResolvedValue({
        ok: false,
        status: 403,
        json: async () => ({ detail: 'دسترسی مجاز نیست.' }),
      }),
    )

    const err = await apiGet('/api/v1/reports/profit').catch((e) => e)
    expect(err).toBeInstanceOf(ApiError)
    expect(err.status).toBe(403)
  })
})
