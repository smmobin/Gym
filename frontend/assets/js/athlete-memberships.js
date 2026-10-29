import { formatJalaliDate, formatToman, membershipStatusLabelFa } from './format.js'

/** @param {string} value */
function escapeHtml(value) {
  return String(value)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
}

/**
 * Card grid for athlete «اشتراک من».
 * @param {any[]} items
 */
export function athleteMembershipCardsHtml(items) {
  if (!items.length) return '<p class="hint">اشتراکی نیست.</p>'
  return `<div class="athlete-membership-grid">${items
    .map((m) => {
      const status = String(m.status || '')
      const statusFa = membershipStatusLabelFa(status)
      const badgeClass =
        status === 'active' ? 'ok' : status === 'frozen' ? 'warn' : status === 'expired' ? 'danger' : ''
      const title = m.plan_name || `طرح ${m.plan_id}`
      const range = `${formatJalaliDate(m.start_date)} تا ${formatJalaliDate(m.end_date)}`
      return `<article class="athlete-membership-card" data-status="${escapeHtml(status)}">
        <span class="badge ${badgeClass}">${escapeHtml(statusFa)}</span>
        <h3 class="athlete-membership-title">${escapeHtml(title)}</h3>
        <p class="athlete-membership-meta">${escapeHtml(range)}</p>
        <p class="athlete-membership-price">${escapeHtml(formatToman(m.agreed_amount_toman))}</p>
      </article>`
    })
    .join('')}</div>`
}
