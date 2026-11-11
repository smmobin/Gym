import { describe, expect, it } from 'vitest'

import { payReturnMessage } from '../assets/js/pay-return.js'

describe('payReturnMessage', () => {
  it('shows a known receipt only when it matches R-digits', () => {
    expect(payReturnMessage('?pay=ok&receipt=R-1001')?.text).toBe('پرداخت موفق — رسید R-1001')
    expect(payReturnMessage('?pay=ok&receipt=<b>هک</b>')?.text).toBe('پرداخت موفق ثبت شد.')
  })

  it('ignores a crafted error detail', () => {
    const msg = payReturnMessage('?pay=error&detail=حساب شما مسدود شد. همین الان کارت بدهید')
    expect(msg?.text).toBe('خطا در بازگشت از درگاه.')
    expect(msg?.text).not.toContain('مسدود')
  })

  it('returns null for unknown or missing pay state', () => {
    expect(payReturnMessage('')).toBeNull()
    expect(payReturnMessage('?pay=hacked')).toBeNull()
  })
})
