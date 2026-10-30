/** SMS templates — card UI + quick/custom send when /sms/status enabled. */

import { apiGet, apiPost, ApiError } from './api.js'
import { formatJalaliDate } from './format.js'
import { bindMemberSearch, personSelectRowHtml, setPersonChip } from './members.js'

const FALLBACK_TEMPLATES = [
  {
    id: 'welcome',
    title: 'پیام خوش‌آمدگویی',
    body: 'سلام {{name}}، به باشگاه آذر خوش آمدید. کد عضویت شما {{display_id}} است.',
  },
  {
    id: 'expiry',
    title: 'هشدار انقضای اشتراک',
    body: '{{name}} عزیز، اشتراک شما تا {{end_date}} فعال است. برای تمدید با منشی تماس بگیرید.',
  },
  {
    id: 'debt',
    title: 'یادآوری بدهی',
    body: '{{name}}، مبلغ بدهی ثبت‌شده شما {{debt}} تومان است. لطفاً پیگیری کنید.',
  },
]

const TEMPLATE_META = {
  welcome: { icon: 'star', title: 'پیام خوش‌آمدگویی' },
  expiry: { icon: 'clock', title: 'هشدار انقضای اشتراک' },
  debt: { icon: 'card', title: 'یادآوری بدهی' },
}

/** @param {string} name */
function iconSvg(name) {
  if (name === 'clock') {
    return `<svg viewBox="0 0 24 24" width="20" height="20" aria-hidden="true" fill="none" stroke="currentColor" stroke-width="1.75"><circle cx="12" cy="12" r="8"/><path d="M12 8v4l2.5 2.5"/></svg>`
  }
  if (name === 'card') {
    return `<svg viewBox="0 0 24 24" width="20" height="20" aria-hidden="true" fill="none" stroke="currentColor" stroke-width="1.75"><rect x="3" y="6" width="18" height="12" rx="2"/><path d="M3 10h18"/><path d="M7 15h4"/></svg>`
  }
  return `<svg viewBox="0 0 24 24" width="20" height="20" aria-hidden="true" fill="none" stroke="currentColor" stroke-width="1.75"><path d="M12 3.5l2.2 4.5 5 .7-3.6 3.5.9 5-4.5-2.4-4.5 2.4.9-5L4.8 8.7l5-.7L12 3.5z"/></svg>`
}

/** @param {string} text */
export function smsCharStats(text) {
  const len = [...String(text || '')].length
  if (len === 0) return { len: 0, segments: 0, limit: 70 }
  const hasUnicode = /[^\u0000-\u007F]/.test(text)
  const limit = hasUnicode ? 70 : 160
  return { len, segments: Math.ceil(len / limit), limit }
}

/** @param {number} n */
function faNum(n) {
  return Number(n || 0).toLocaleString('fa-IR')
}

/** @param {string} s */
function escapeHtml(s) {
  return String(s)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
}

/**
 * Preview variables for the selected member (null = keep raw {{tags}}).
 * @param {{ first_name?: string, last_name?: string, display_id?: string } | null | undefined} member
 * @param {{ end_date?: string, debt?: string } | null | undefined} extras
 * @returns {Record<string, string> | null}
 */
export function previewVarsFromMember(member, extras = null) {
  if (!member) return null
  const name = `${member.first_name || ''} ${member.last_name || ''}`.trim() || '—'
  return {
    name,
    display_id: member.display_id || '—',
    end_date: (extras && extras.end_date) || '—',
    debt: (extras && extras.debt) || '—',
  }
}

/**
 * Replace {{placeholders}} with preview values (or leave tags if unknown / no vars).
 * @param {string} body
 * @param {Record<string, string> | null | undefined} vars
 */
export function renderBodyText(body, vars = null) {
  if (!vars) return String(body || '')
  return String(body || '').replace(/\{\{\s*([a-zA-Z0-9_]+)\s*\}\}/g, (full, key) =>
    Object.prototype.hasOwnProperty.call(vars, key) ? vars[key] : full,
  )
}

/**
 * Highlight {{placeholders}} (or filled values) inside escaped body text.
 * @param {string} body
 * @param {Record<string, string> | null | undefined} vars
 */
export function formatBodyHtml(body, vars = null) {
  return escapeHtml(body).replace(/\{\{\s*([a-zA-Z0-9_]+)\s*\}\}/g, (full, key) => {
    if (vars && Object.prototype.hasOwnProperty.call(vars, key)) {
      return `<span class="sms-ph is-filled">${escapeHtml(vars[key])}</span>`
    }
    return `<span class="sms-ph">${full}</span>`
  })
}

/**
 * @param {HTMLElement} root
 */
export function mountSmsTemplates(root) {
  root.innerHTML = `
    <article class="panel sms-panel">
      <header class="panel-head">
        <h2>قالب پیامک</h2>
        <span class="tag" data-sms-tag>در حال بررسی…</span>
      </header>
      <p class="hint" data-sms-hint></p>
      <div data-sms-picker hidden>
        ${personSelectRowHtml({
          label: 'عضو گیرنده',
          inputAttr: 'data-sms-member-q',
          pickAttr: 'data-sms-member-pick',
          chipAttr: 'data-sms-member-label',
          placeholder: 'جستجوی نام یا موبایل',
          emptyText: 'عضوی انتخاب نشده است',
        })}
      </div>
      <p class="hint" data-sms-result hidden></p>
      <div class="sms-board" data-sms-board></div>
    </article>
  `

  const tag = /** @type {HTMLElement} */ (root.querySelector('[data-sms-tag]'))
  const hint = /** @type {HTMLElement} */ (root.querySelector('[data-sms-hint]'))
  const picker = /** @type {HTMLElement} */ (root.querySelector('[data-sms-picker]'))
  const memberInput = /** @type {HTMLInputElement} */ (root.querySelector('[data-sms-member-q]'))
  const memberLabel = /** @type {HTMLElement} */ (root.querySelector('[data-sms-member-label]'))
  const memberPick = /** @type {HTMLElement} */ (root.querySelector('[data-sms-member-pick]'))
  const resultEl = /** @type {HTMLElement} */ (root.querySelector('[data-sms-result]'))
  const board = /** @type {HTMLElement} */ (root.querySelector('[data-sms-board]'))

  /** @type {{ id: number, display_id?: string, first_name?: string, last_name?: string, mobile?: string } | null} */
  let selected = null
  /** @type {{ end_date?: string, debt?: string }} */
  let previewExtras = {}
  /** @type {boolean} */
  let enabled = false
  /** @type {Array<{id: string, title: string, body: string}>} */
  let templates = [...FALLBACK_TEMPLATES]
  /** @type {Set<string>} */
  const hiddenIds = new Set()
  /** @type {string} */
  let customDraft = ''

  function setResult(text, ok) {
    resultEl.hidden = !text
    resultEl.textContent = text || ''
    resultEl.classList.toggle('ok', !!ok)
    resultEl.classList.toggle('err', !!text && !ok)
  }

  function currentPreviewVars() {
    return previewVarsFromMember(selected, previewExtras)
  }

  /**
   * Latest membership end_date + debt for SMS preview tags.
   * @param {number} memberId
   */
  async function loadPreviewExtras(memberId) {
    try {
      const mem = await apiGet(`/api/v1/members/${memberId}/memberships`)
      if (!selected || selected.id !== memberId) return
      const items = Array.isArray(mem.items) ? mem.items : []
      let endRaw = ''
      for (const row of items) {
        const ed = row && row.end_date ? String(row.end_date) : ''
        if (ed && (!endRaw || ed > endRaw)) endRaw = ed
      }
      previewExtras = {
        end_date: endRaw ? formatJalaliDate(endRaw) : '—',
        debt: faNum(Number(mem.debt_toman || 0)),
      }
      paint()
    } catch {
      if (!selected || selected.id !== memberId) return
      previewExtras = { end_date: '—', debt: '—' }
      paint()
    }
  }

  function paint() {
    const existingCustom = /** @type {HTMLTextAreaElement | null} */ (
      board.querySelector('[data-sms-custom-text]')
    )
    if (existingCustom) customDraft = existingCustom.value

    const vars = currentPreviewVars()
    const visible = templates.filter((t) => !hiddenIds.has(t.id))
    const cards = visible
      .map((t) => {
        const meta = TEMPLATE_META[t.id] || { icon: 'star', title: t.title }
        const title = meta.title || t.title
        return `<article class="sms-card" data-sms-card="${escapeHtml(t.id)}">
          <header class="sms-card-head">
            <h3>${escapeHtml(title)}</h3>
            <span class="sms-card-icon" aria-hidden="true">${iconSvg(meta.icon)}</span>
          </header>
          <div class="sms-card-body">${formatBodyHtml(t.body, vars)}</div>
          <div class="sms-card-actions">
            <button type="button" class="btn sms-send-btn" data-sms-send="${escapeHtml(t.id)}" ${
              enabled ? '' : 'disabled'
            } title="${enabled ? 'ارسال به عضو انتخاب‌شده' : 'هنوز آماده نیست'}">
              <span>ارسال سریع</span>
              <svg viewBox="0 0 24 24" width="16" height="16" aria-hidden="true" fill="none" stroke="currentColor" stroke-width="2"><path d="M5 12h12M13 6l6 6-6 6"/></svg>
            </button>
            <button type="button" class="sms-icon-btn" data-sms-edit="${escapeHtml(t.id)}" title="ویرایش در پیام دلخواه" aria-label="ویرایش قالب ${escapeHtml(title)}">
              <svg viewBox="0 0 24 24" width="16" height="16" aria-hidden="true" fill="none" stroke="currentColor" stroke-width="1.75"><path d="M12 20h9"/><path d="M16.5 3.5a2.1 2.1 0 0 1 3 3L7 19l-4 1 1-4 12.5-12.5z"/></svg>
            </button>
            <button type="button" class="sms-icon-btn is-danger" data-sms-hide="${escapeHtml(t.id)}" title="پنهان کردن از این نما" aria-label="پنهان کردن قالب ${escapeHtml(title)}">
              <svg viewBox="0 0 24 24" width="16" height="16" aria-hidden="true" fill="none" stroke="currentColor" stroke-width="1.75"><path d="M3 6h18"/><path d="M8 6V4h8v2"/><path d="M6 6l1 14h10l1-14"/></svg>
            </button>
          </div>
        </article>`
      })
      .join('')

    const stats = smsCharStats(customDraft)
    board.innerHTML = `
      <div class="sms-grid">
        ${cards}
        <article class="sms-card sms-card-custom" data-sms-custom>
          <header class="sms-card-head">
            <h3>ارسال پیامک دلخواه و متفرقه</h3>
            <span class="sms-card-icon" aria-hidden="true">
              <svg viewBox="0 0 24 24" width="20" height="20" fill="none" stroke="currentColor" stroke-width="1.75"><path d="M4 5h16v11H8l-4 3V5z"/></svg>
            </span>
          </header>
          <label class="sms-custom-label">
            <span class="visually-hidden">متن پیامک دلخواه</span>
            <textarea class="sms-custom-input" data-sms-custom-text rows="5" placeholder="متن پیامک دلخواه خود را در این بخش بنویسید…" ${
              enabled ? '' : 'disabled'
            }></textarea>
          </label>
          <p class="sms-char-count" data-sms-char-count>تعداد کاراکتر: ${faNum(stats.len)} (${faNum(stats.segments)} پیامک)</p>
          <div class="sms-card-actions sms-custom-actions">
            <button type="button" class="btn sms-send-btn" data-sms-custom-send ${enabled ? '' : 'disabled'}>
              <span>ارسال پیام دلخواه</span>
              <svg viewBox="0 0 24 24" width="16" height="16" aria-hidden="true" fill="none" stroke="currentColor" stroke-width="2"><path d="M19 12H7M11 6l-6 6 6 6"/></svg>
            </button>
            <button type="button" class="sms-icon-btn is-danger" data-sms-custom-clear title="پاک کردن متن" aria-label="پاک کردن متن پیام دلخواه">
              <svg viewBox="0 0 24 24" width="16" height="16" aria-hidden="true" fill="none" stroke="currentColor" stroke-width="1.75"><path d="M3 6h18"/><path d="M8 6V4h8v2"/><path d="M6 6l1 14h10l1-14"/></svg>
            </button>
          </div>
        </article>
      </div>
    `

    const customText = /** @type {HTMLTextAreaElement | null} */ (board.querySelector('[data-sms-custom-text]'))
    const charCount = /** @type {HTMLElement | null} */ (board.querySelector('[data-sms-char-count]'))
    if (customText) customText.value = customDraft

    const syncCount = () => {
      if (!charCount || !customText) return
      customDraft = customText.value
      const s = smsCharStats(customText.value)
      charCount.textContent = `تعداد کاراکتر: ${faNum(s.len)} (${faNum(s.segments)} پیامک)`
    }
    customText?.addEventListener('input', syncCount)

    board.querySelectorAll('[data-sms-send]').forEach((btn) => {
      btn.addEventListener('click', () => {
        void sendTemplate(/** @type {HTMLButtonElement} */ (btn).getAttribute('data-sms-send') || '')
      })
    })
    board.querySelectorAll('[data-sms-edit]').forEach((btn) => {
      btn.addEventListener('click', () => {
        const id = /** @type {HTMLButtonElement} */ (btn).getAttribute('data-sms-edit') || ''
        const t = templates.find((x) => x.id === id)
        if (!t || !customText) return
        customText.value = renderBodyText(t.body, currentPreviewVars())
        customDraft = customText.value
        customText.focus()
        syncCount()
        customText.scrollIntoView({ behavior: 'smooth', block: 'center' })
        setResult('متن قالب به بخش پیام دلخواه منتقل شد؛ در صورت نیاز ویرایش و ارسال کنید.', true)
      })
    })
    board.querySelectorAll('[data-sms-hide]').forEach((btn) => {
      btn.addEventListener('click', () => {
        const id = /** @type {HTMLButtonElement} */ (btn).getAttribute('data-sms-hide') || ''
        if (!id) return
        if (!window.confirm('این قالب فقط از نمای فعلی پنهان می‌شود (قالب سیستمی روی سرور می‌ماند). ادامه؟')) {
          return
        }
        hiddenIds.add(id)
        paint()
      })
    })
    board.querySelector('[data-sms-custom-clear]')?.addEventListener('click', () => {
      if (!customText) return
      customText.value = ''
      customDraft = ''
      syncCount()
    })
    board.querySelector('[data-sms-custom-send]')?.addEventListener('click', () => {
      void sendCustom(customText?.value || '')
    })
  }

  /**
   * @param {string} templateId
   */
  async function sendTemplate(templateId) {
    if (!enabled) return
    if (!selected?.id) {
      setResult('اول یک عضو را از جستجو انتخاب کنید.', false)
      return
    }
    setResult('در حال ارسال…', true)
    try {
      const res = await apiPost('/api/v1/sms/send', {
        template_id: templateId,
        member_id: selected.id,
      })
      setResult(res.detail || `پیامک برای ${res.display_id} ارسال شد.`, true)
    } catch (err) {
      const msg = err instanceof ApiError ? err.message : 'ارسال پیامک ناموفق بود.'
      setResult(msg, false)
    }
  }

  /**
   * @param {string} message
   */
  async function sendCustom(message) {
    if (!enabled) return
    if (!selected?.id) {
      setResult('اول یک عضو را از جستجو انتخاب کنید.', false)
      return
    }
    const text = String(message || '').trim()
    if (!text) {
      setResult('متن پیام دلخواه را بنویسید.', false)
      return
    }
    setResult('در حال ارسال…', true)
    try {
      const res = await apiPost('/api/v1/sms/send-custom', {
        member_id: selected.id,
        message: text,
      })
      setResult(res.detail || `پیامک برای ${res.display_id} ارسال شد.`, true)
    } catch (err) {
      const msg = err instanceof ApiError ? err.message : 'ارسال پیامک ناموفق بود.'
      setResult(msg, false)
    }
  }

  async function boot() {
    let status = { enabled: false, provider: 'none', label: 'هنوز آماده نیست' }
    try {
      status = await apiGet('/api/v1/sms/status')
    } catch {
      status = { enabled: false, provider: 'none', label: 'هنوز آماده نیست' }
    }

    enabled = !!status.enabled
    tag.textContent = enabled ? status.label || 'پیامک فعال' : 'هنوز آماده نیست'

    if (!enabled) {
      hint.textContent =
        'ارسال واقعی پیامک در این نسخه فعال نیست. دکمه‌های ارسال غیرفعال‌اند.'
      picker.hidden = true
      templates = [...FALLBACK_TEMPLATES]
      paint()
      return
    }

    hint.textContent =
      'عضو را جستجو و انتخاب کنید، سپس «ارسال سریع» یا پیام دلخواه را بزنید. موبایل از پروندهٔ عضو خوانده می‌شود.'
    picker.hidden = false

    bindMemberSearch(memberPick, memberInput, (member) => {
      selected = member
      previewExtras = { end_date: '—', debt: '—' }
      const name = `${member.first_name || ''} ${member.last_name || ''}`.trim()
      setPersonChip(memberLabel, member)
      memberInput.value = name
      setResult('', true)
      paint()
      void loadPreviewExtras(member.id)
    })

    templates = [...FALLBACK_TEMPLATES]
    try {
      const data = await apiGet('/api/v1/sms/templates')
      if (Array.isArray(data.items) && data.items.length) {
        templates = data.items.map((t) => ({
          ...t,
          title: (TEMPLATE_META[t.id] && TEMPLATE_META[t.id].title) || t.title,
        }))
      }
    } catch {
      // keep fallback
    }
    paint()
  }

  void boot()
}
