import { ApiError, apiGet } from './api.js'

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
 *   name: string,
 *   description?: string | null,
 *   duration_days?: number | null,
 *   session_count?: number | null,
 *   base_price_toman: number,
 *   includes_locker: boolean,
 * }} PublicPlan
 */

/**
 * Featured rule: middle card when exactly 3 plans; otherwise the most expensive.
 * @param {PublicPlan[]} plans
 * @returns {number | null} plan id
 */
export function pickFeaturedPlanId(plans) {
  if (!plans.length) return null
  if (plans.length === 3) return plans[1].id
  let best = plans[0]
  for (const p of plans) {
    if (Number(p.base_price_toman) > Number(best.base_price_toman)) best = p
  }
  return best.id
}

/**
 * @param {PublicPlan} plan
 * @returns {string[]}
 */
export function planBulletLines(plan) {
  /** @type {string[]} */
  const lines = []
  const desc = String(plan.description || '').trim()
  if (desc) {
    for (const part of desc.split(/[\n•·|]+/)) {
      const t = part.trim()
      if (t) lines.push(t)
    }
  }
  if (plan.duration_days != null && plan.duration_days > 0) {
    lines.push(`${Number(plan.duration_days).toLocaleString('fa-IR')} روز`)
  }
  if (plan.session_count != null && plan.session_count > 0) {
    lines.push(`${Number(plan.session_count).toLocaleString('fa-IR')} جلسه`)
  }
  if (plan.includes_locker) lines.push('شامل کمد')
  return lines.slice(0, 4)
}

/**
 * @param {PublicPlan[]} plans
 * @param {number | null} featuredId
 */
export function renderPublicPlanCards(plans, featuredId) {
  if (!plans.length) {
    return `<p class="plans-empty hint" data-plans-empty>فعلاً طرح فعالی برای نمایش نیست — از میز پذیرش بپرسید.</p>`
  }
  return plans
    .map((plan) => {
      const featured = plan.id === featuredId
      const bullets = planBulletLines(plan)
      const price = Number(plan.base_price_toman || 0).toLocaleString('fa-IR')
      const ctaClass = featured ? 'btn wide' : 'btn ghost wide'
      const ctaLabel = featured ? 'انتخاب این طرح' : 'شروع نمایشی'
      const tag = featured ? `<span class="plan-tag">پیشنهاد باشگاه</span>` : ''
      const list =
        bullets.length > 0
          ? `<ul>${bullets.map((b) => `<li>${escapeHtml(b)}</li>`).join('')}</ul>`
          : ''
      return `<article class="plan${featured ? ' featured' : ''}" data-plan-id="${plan.id}">
        ${tag}
        <div class="plan-body">
          <h3>${escapeHtml(plan.name)}</h3>
          <p class="price">${price} <small>تومان</small></p>
          ${list}
        </div>
        <a class="${ctaClass}" href="#trial">${ctaLabel}</a>
      </article>`
    })
    .join('')
}

/**
 * Fill landing `#plans .plan-grid` from the public API.
 * @param {HTMLElement} grid
 * @param {HTMLElement | null} [statusEl]
 * @param {{ fetchPlans?: () => Promise<{ items: PublicPlan[] }> }} [opts]
 */
export async function mountPublicPlans(grid, statusEl = null, opts = {}) {
  const fetchPlans =
    opts.fetchPlans ||
    (async () => {
      const data = await apiGet('/api/v1/public/membership-plans')
      return { items: Array.isArray(data?.items) ? data.items : [] }
    })

  grid.setAttribute('aria-busy', 'true')
  grid.innerHTML = `<p class="plans-loading hint" data-plans-loading>در حال بارگذاری طرح‌ها…</p>`
  if (statusEl) {
    statusEl.hidden = true
    statusEl.textContent = ''
    statusEl.className = 'plans-status hint'
  }

  try {
    const data = await fetchPlans()
    const items = Array.isArray(data?.items) ? data.items : []
    const featuredId = pickFeaturedPlanId(items)
    grid.innerHTML = renderPublicPlanCards(items, featuredId)
    grid.removeAttribute('aria-busy')
  } catch (err) {
    grid.innerHTML = ''
    grid.removeAttribute('aria-busy')
    const msg =
      err instanceof ApiError
        ? err.message
        : 'فعلاً طرح‌ها در دسترس نیست — از میز پذیرش بپرسید.'
    if (statusEl) {
      statusEl.hidden = false
      statusEl.className = 'plans-status status-msg error'
      statusEl.textContent = msg
    } else {
      grid.innerHTML = `<p class="plans-status status-msg error" data-plans-error>${escapeHtml(msg)}</p>`
    }
  }
}
