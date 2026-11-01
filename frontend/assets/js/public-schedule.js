import { ApiError, apiGet } from './api.js'
import { formatJalaliWeekday, formatTimeFa } from './format.js'

/** @param {string} value */
function escapeHtml(value) {
  return String(value)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
}

/**
 * @typedef {{
 *   id: number,
 *   title: string,
 *   trainer_full_name?: string | null,
 *   capacity: number,
 *   booked_count: number,
 *   remaining: number,
 *   gender_label?: string,
 *   starts_at: string,
 *   ends_at?: string,
 * }} PublicClass
 */

/**
 * Capacity badge: remaining of total; warn when ≤2 left; full → تکمیل.
 * @param {PublicClass} row
 */
export function capacityBadgeHtml(row) {
  const capacity = Number(row.capacity || 0)
  const remaining = Number(row.remaining ?? Math.max(capacity - Number(row.booked_count || 0), 0))
  if (remaining <= 0) {
    return `<span class="badge danger">تکمیل</span>`
  }
  const label = `${remaining.toLocaleString('fa-IR')} از ${capacity.toLocaleString('fa-IR')}`
  const kind = remaining <= 2 ? 'warn' : 'ok'
  return `<span class="badge ${kind}">${label}</span>`
}

/**
 * @param {PublicClass} row
 */
export function scheduleCtaHtml(row) {
  const remaining = Number(row.remaining ?? 0)
  if (remaining <= 0) {
    return `<button class="btn ghost small" type="button" disabled>ظرفیت تکمیل</button>`
  }
  return `<a class="btn small" href="/login/">ورود برای رزرو</a>`
}

/**
 * @param {PublicClass[]} items
 */
export function renderPublicScheduleRows(items) {
  if (!items.length) {
    return `<tr data-schedule-empty><td colspan="6"><p class="hint">فعلاً کلاس پیش‌رویی برای نمایش نیست — از میز پذیرش بپرسید.</p></td></tr>`
  }
  return items
    .map((row) => {
      const title = escapeHtml(row.title || '—')
      const day = escapeHtml(formatJalaliWeekday(row.starts_at))
      const time = escapeHtml(formatTimeFa(row.starts_at))
      const trainer = escapeHtml(String(row.trainer_full_name || '—').trim() || '—')
      return `<tr data-class-id="${row.id}">
          <td data-label="کلاس">${title}</td>
          <td data-label="روز">${day}</td>
          <td data-label="ساعت">${time}</td>
          <td data-label="مربی">${trainer}</td>
          <td data-label="ظرفیت">${capacityBadgeHtml(row)}</td>
          <td data-label="">${scheduleCtaHtml(row)}</td>
        </tr>`
    })
    .join('')
}

/**
 * Fill landing `#schedule tbody` from the public API.
 * @param {HTMLElement} tbody
 * @param {HTMLElement | null} [statusEl]
 * @param {{ fetchClasses?: () => Promise<{ items: PublicClass[] }> }} [opts]
 */
export async function mountPublicSchedule(tbody, statusEl = null, opts = {}) {
  const fetchClasses =
    opts.fetchClasses ||
    (async () => {
      const data = await apiGet('/api/v1/public/group-classes')
      return { items: Array.isArray(data?.items) ? data.items : [] }
    })

  tbody.setAttribute('aria-busy', 'true')
  tbody.innerHTML = `<tr data-schedule-loading><td colspan="6"><p class="hint">در حال بارگذاری کلاس‌ها…</p></td></tr>`
  if (statusEl) {
    statusEl.hidden = true
    statusEl.textContent = ''
    statusEl.className = 'schedule-status hint'
  }

  try {
    const data = await fetchClasses()
    const items = Array.isArray(data?.items) ? data.items : []
    tbody.innerHTML = renderPublicScheduleRows(items)
    tbody.removeAttribute('aria-busy')
  } catch (err) {
    tbody.innerHTML = ''
    tbody.removeAttribute('aria-busy')
    const msg =
      err instanceof ApiError
        ? err.message
        : 'فعلاً برنامه کلاس در دسترس نیست — از میز پذیرش بپرسید.'
    if (statusEl) {
      statusEl.hidden = false
      statusEl.className = 'schedule-status status-msg error'
      statusEl.textContent = msg
    } else {
      tbody.innerHTML = `<tr data-schedule-error><td colspan="6"><p class="status-msg error">${escapeHtml(msg)}</p></td></tr>`
    }
  }
}
