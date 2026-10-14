import { afterEach, describe, expect, it, vi } from 'vitest'

import { apiGet } from './api'

describe('apiGet', () => {
  afterEach(() => {
    vi.unstubAllGlobals()
  })

  it('returns JSON when response is ok', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn().mockResolvedValue({
        ok: true,
        json: async () => ({ status: 'ok' }),
      }),
    )

    await expect(apiGet<{ status: string }>('/api/v1/health')).resolves.toEqual({
      status: 'ok',
    })
  })

  it('throws when response is not ok', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn().mockResolvedValue({
        ok: false,
        status: 500,
      }),
    )

    await expect(apiGet('/api/v1/health')).rejects.toThrow('API 500: /api/v1/health')
  })
})
