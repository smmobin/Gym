import {
  formatJalaliDate,
  formatToman,
  paymentMethodLabelFa,
  paymentStatusLabelFa,
} from './format.js'

/** @param {string} value */
function escapeHtml(value) {
  return String(value)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
}

/**
 * Receipt cards for athlete «پرداخت‌های من».
 * @param {any[]} items
 */
export function athletePaymentCardsHtml(items) {
  if (!items.length) return '<p class="hint">پرداختی نیست.</p>'
  return `<div class="athlete-payment-list">${items
    .map((p) => {
      const status = String(p.status || '')
      const statusFa = paymentStatusLabelFa(status)
      const badgeClass =
        status === 'paid'
          ? 'ok'
          : status === 'pending'
            ? 'warn'
            : status === 'failed' || status === 'cancelled'
              ? 'danger'
              : ''
      const receipt = p.receipt_number || `پ-${p.id}`
      const when = formatJalaliDate(p.paid_at || p.created_at)
      const method = paymentMethodLabelFa(p.method)
      return `<article class="athlete-payment-card" data-status="${escapeHtml(status)}">
        <div class="athlete-payment-card-top">
          <span class="badge ${badgeClass}">${escapeHtml(statusFa)}</span>
          <span class="athlete-payment-receipt">رسید ${escapeHtml(String(receipt))}</span>
        </div>
        <p class="athlete-payment-amount">${escapeHtml(formatToman(p.amount_toman))}</p>
        <p class="athlete-payment-meta">${escapeHtml(method)} · ${escapeHtml(when)}</p>
      </article>`
    })
    .join('')}</div>`
}
