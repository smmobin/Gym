import { ApiError, apiGet } from './api.js'
import { createAutoRefresh } from './auto-refresh.js'
import { LIVE } from './live-data.js'
import { setStatus } from './ui.js'

const TRIAL_STATUS_FA = {
  new: 'جدید',
  contacted: 'تماس‌گرفته',
  converted: 'تبدیل',
  closed: 'بسته',
}

/**
 * @param {{
 *   today_attendance_total: number,
 *   today_open_count: number,
 *   trial_open_count: number,
 *   guests_today_count: number,
 * }} summary
 */
export function buildDeskStatsHtml(summary) {
  const n = (v) => Number(v || 0).toLocaleString('fa-IR')
  return `
    <article class="stat accent"><span class="stat-label">حاضر امروز</span><strong>${n(summary.today_attendance_total)}</strong><em>ثبت ورود</em></article>
    <article class="stat"><span class="stat-label">باز بدون خروج</span><strong>${n(summary.today_open_count)}</strong><em>هنوز در سالن</em></article>
    <article class="stat"><span class="stat-label">صف آزمایشی باز</span><strong>${n(summary.trial_open_count)}</strong><em>جدید / تماس</em></article>
    <article class="stat"><span class="stat-label">مهمان امروز</span><strong>${n(summary.guests_today_count)}</strong><em>اشتراک یک‌روزه</em></article>
  `
}

/**
 * @param {string} title
 * @param {string} emptyText
 * @param {Array<{ title: string, body?: string | null, href: string }>} items
 * @param {string} moreHref
 * @param {string} moreLabel
 */
export function buildDeskActionPanelHtml(title, emptyText, items, moreHref, moreLabel) {
  const rows = items || []
  const list = rows.length
    ? rows
        .map((item) => {
          const body = item.body ? `<p>${escapeHtml(formatTrialBody(item.body))}</p>` : ''
          return `<a class="row-item" href="${escapeAttr(item.href)}"><div>
            <h3>${escapeHtml(item.title)}</h3>${body}</div></a>`
        })
        .join('')
    : `<p class="hint">${escapeHtml(emptyText)}</p>`
  return `
    <article class="panel">
      <header class="panel-head">
        <h2>${escapeHtml(title)}</h2>
        <a class="btn ghost small" href="${escapeAttr(moreHref)}">${escapeHtml(moreLabel)}</a>
      </header>
      <div class="list">${list}</div>
    </article>
  `
}

/** @param {string} body */
function formatTrialBody(body) {
  return String(body).replace(/\b(new|contacted|converted|closed)\b/g, (m) => TRIAL_STATUS_FA[m] || m)
}

function escapeHtml(s) {
  return String(s)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
}

function escapeAttr(s) {
  return escapeHtml(s).replace(/'/g, '&#39;')
}

/** @param {HTMLElement} root @param {{ role: string }} user */
export function mountDeskDashboard(root, user) {
  if (user.role !== 'receptionist' && user.role !== 'manager') {
    root.innerHTML = '<p class="status-msg error">داشبورد عملیاتی فقط برای منشی یا مدیر است.</p>'
    return
  }

  root.innerHTML = `
    <div class="status-msg" data-status hidden></div>
    <div class="stats" data-stats></div>
    <div class="grid-2" data-actions style="margin-top:11px"></div>
    <p class="hint">این صفحه وضعیت امروز میز است؛ جزئیات هر مورد را از منوی کناری باز کنید. بدهی ≠ درآمد.</p>
  `

  const status = root.querySelector('[data-status]')
  const statsEl = root.querySelector('[data-stats]')
  const actionsEl = root.querySelector('[data-actions]')

  /**
   * @param {{ silent?: boolean }} [ctx]
   */
  async function load(ctx = {}) {
    const silent = !!ctx.silent
    if (!silent) setStatus(status, 'بارگذاری داشبورد…', 'loading')
    try {
      const data = await apiGet('/api/v1/desk/summary')
      if (statsEl) statsEl.innerHTML = buildDeskStatsHtml(data)
      if (actionsEl) {
        actionsEl.innerHTML = [
          buildDeskActionPanelHtml(
            'نزدیک به انقضا',
            'عضویت نزدیک به انقضا نیست.',
            data.expiring,
            '#billing',
            'مالی',
          ),
          buildDeskActionPanelHtml(
            'بدهی اعضا',
            'بدهی ثبت‌شده‌ای نیست.',
            data.debt,
            '#billing',
            'مالی',
          ),
          buildDeskActionPanelHtml(
            'درخواست تمدید',
            'درخواست تمدیدی نیست.',
            data.renewals,
            '#billing',
            'مالی',
          ),
          buildDeskActionPanelHtml(
            'صف آزمایشی',
            'درخواست باز در صف نیست.',
            data.trial_leads,
            '#trial',
            'صف کامل',
          ),
        ].join('')
      }
      if (!silent) setStatus(status, 'خلاصهٔ امروز به‌روز شد.', 'ok')
    } catch (err) {
      setStatus(status, err instanceof ApiError ? err.message : 'خطا در بارگذاری داشبورد', 'error')
      throw err
    }
  }

  createAutoRefresh(root, load, {
    intervalMs: 15_000,
    events: [LIVE.BILLING, LIVE.MEMBERS, LIVE.ATTENDANCE, LIVE.TRIAL],
  })
}
