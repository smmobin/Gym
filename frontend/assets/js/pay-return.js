const RECEIPT_RE = /^R-\d{1,8}$/

/**
 * Message after the gateway sends the athlete back.
 * Query text is not trusted: only known `pay` values and receipt ids like R-1001.
 * @param {string} search
 * @returns {{ text: string, ok: boolean } | null}
 */
export function payReturnMessage(search) {
  const raw = String(search || '')
  const params = new URLSearchParams(raw.startsWith('?') ? raw.slice(1) : raw)
  const pay = params.get('pay')
  if (!pay) return null
  const receipt = params.get('receipt') || ''
  const safeReceipt = RECEIPT_RE.test(receipt) ? receipt : ''
  const map = {
    ok: safeReceipt ? `پرداخت موفق — رسید ${safeReceipt}` : 'پرداخت موفق ثبت شد.',
    cancelled: 'پرداخت لغو شد یا ناتمام ماند.',
    failed: 'تأیید پرداخت ناموفق بود.',
    error: 'خطا در بازگشت از درگاه.',
  }
  const text = map[pay]
  if (!text) return null
  return { text, ok: pay === 'ok' }
}
