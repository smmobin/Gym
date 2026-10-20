import { afterEach, describe, expect, it, vi } from 'vitest'

import { apiGet, apiPost } from '../assets/js/api.js'
import { onlineMethodLabel } from '../assets/js/format.js'

describe('payment gateway UI helpers', () => {
  afterEach(() => {
    vi.unstubAllGlobals()
  })

  it('onlineMethodLabel reflects gateway flag', () => {
    expect(onlineMethodLabel(false)).toContain('بدون درگاه')
    expect(onlineMethodLabel(true)).toContain('درگاه')
  })

  it('reads enabled gateway status without secrets', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn().mockResolvedValue({
        ok: true,
        status: 200,
        json: async () => ({
          enabled: true,
          provider: 'zarinpal',
          sandbox: true,
          label: 'درگاه آنلاین فعال (آزمایشی / sandbox)',
        }),
      }),
    )
    const res = await apiGet('/api/v1/payments/gateway/status')
    expect(res.enabled).toBe(true)
    expect(res.provider).toBe('zarinpal')
    expect(JSON.stringify(res).toLowerCase()).not.toContain('merchant')
  })

  it('reads disabled gateway status', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn().mockResolvedValue({
        ok: true,
        status: 200,
        json: async () => ({
          enabled: false,
          provider: 'none',
          sandbox: true,
          label: 'درگاه آنلاین هنوز پیکربندی نشده است',
        }),
      }),
    )
    const res = await apiGet('/api/v1/payments/gateway/status')
    expect(res.enabled).toBe(false)
  })

  it('surfaces 403 when online start is disabled', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn().mockResolvedValue({
        ok: false,
        status: 403,
        json: async () => ({
          detail: 'درگاه پرداخت آنلاین هنوز آماده نیست. از درخواست تمدید برای میز استفاده کنید.',
        }),
      }),
    )
    await expect(
      apiPost('/api/v1/athlete/payments/online/start', {
        purpose: 'renew',
        plan_id: 1,
        amount_toman: 100000,
      }),
    ).rejects.toMatchObject({ status: 403 })
  })

  it('happy path returns payment_url when gateway active', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn().mockResolvedValue({
        ok: true,
        status: 201,
        json: async () => ({
          payment_url: 'https://sandbox.zarinpal.com/pg/StartPay/STEST',
          authority: 'STEST',
          payment: { id: 1, status: 'pending', method: 'online' },
          gateway: { enabled: true, provider: 'zarinpal', sandbox: true, label: 'x' },
        }),
      }),
    )
    const res = await apiPost('/api/v1/athlete/payments/online/start', {
      purpose: 'debt',
      amount_toman: 50000,
    })
    expect(res.payment_url).toContain('StartPay')
    expect(res.payment.status).toBe('pending')
  })
})
