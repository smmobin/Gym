import { afterEach, describe, expect, it, vi } from 'vitest'

import { ApiError, apiGet, apiPost } from './api'

describe('api client', () => {
  afterEach(() => {
    vi.unstubAllGlobals()
  })

  it('returns JSON when response is ok', async () => {
    const fetchMock = vi.fn().mockResolvedValue({
      ok: true,
      status: 200,
      json: async () => ({ status: 'ok' }),
    })
    vi.stubGlobal('fetch', fetchMock)

    await expect(apiGet<{ status: string }>('/api/v1/health')).resolves.toEqual({
      status: 'ok',
    })
    expect(fetchMock).toHaveBeenCalledWith(
      '/api/v1/health',
      expect.objectContaining({ credentials: 'include' }),
    )
  })

  it('throws ApiError when response is not ok', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn().mockResolvedValue({
        ok: false,
        status: 401,
        json: async () => ({ detail: 'موبایل یا رمز نادرست است.' }),
      }),
    )

    await expect(apiPost('/api/v1/auth/login', { mobile: 'x', password: 'y' })).rejects.toThrow(
      ApiError,
    )
  })
})
