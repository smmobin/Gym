import { afterEach, describe, expect, it, vi } from 'vitest'

import { apiGet, apiPost } from '../assets/js/api.js'

describe('SMS status and send (mock fetch)', () => {
  afterEach(() => {
    vi.unstubAllGlobals()
  })

  it('reads disabled SMS status without secrets', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn().mockResolvedValue({
        ok: true,
        status: 200,
        json: async () => ({
          enabled: false,
          provider: 'none',
          label: 'پیامک هنوز پیکربندی نشده است',
        }),
      }),
    )
    const res = await apiGet('/api/v1/sms/status')
    expect(res.enabled).toBe(false)
    expect(res.provider).toBe('none')
    expect(JSON.stringify(res).toLowerCase()).not.toContain('api_key')
    expect(JSON.stringify(res).toLowerCase()).not.toContain('secret')
  })

  it('reads enabled SMS status', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn().mockResolvedValue({
        ok: true,
        status: 200,
        json: async () => ({
          enabled: true,
          provider: 'kavenegar',
          label: 'پیامک فعال (کاوه‌نگار)',
        }),
      }),
    )
    const res = await apiGet('/api/v1/sms/status')
    expect(res.enabled).toBe(true)
    expect(res.provider).toBe('kavenegar')
    expect(JSON.stringify(res).toLowerCase()).not.toContain('api_key')
  })

  it('surfaces 403 when send is disabled', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn().mockResolvedValue({
        ok: false,
        status: 403,
        json: async () => ({
          detail: 'ارسال پیامک هنوز آماده نیست.',
        }),
      }),
    )
    await expect(
      apiPost('/api/v1/sms/send', { template_id: 'welcome', member_id: 1 }),
    ).rejects.toMatchObject({ status: 403 })
  })

  it('happy path send returns ok without secrets', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn().mockResolvedValue({
        ok: true,
        status: 200,
        json: async () => ({
          ok: true,
          template_id: 'welcome',
          member_id: 1,
          display_id: 'M-1001',
          provider: 'kavenegar',
          message_id: '123',
          detail: 'پیامک ارسال شد.',
        }),
      }),
    )
    const res = await apiPost('/api/v1/sms/send', {
      template_id: 'welcome',
      member_id: 1,
    })
    expect(res.ok).toBe(true)
    expect(res.display_id).toBe('M-1001')
    expect(JSON.stringify(res).toLowerCase()).not.toContain('api_key')
  })
})
