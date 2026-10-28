/** SMS templates — live send when /sms/status enabled; otherwise placeholder. */

import { apiGet, apiPost, ApiError } from './api.js'
import { bindMemberSearch, personSelectRowHtml, setPersonChip } from './members.js'

const FALLBACK_TEMPLATES = [
  {
    id: 'welcome',
    title: 'خوش‌آمد',
    body: 'سلام {{name}}، به باشگاه آذر خوش آمدید. کد عضویت شما {{display_id}} است.',
  },
  {
    id: 'expiry',
    title: 'انقضای نزدیک',
    body: '{{name}} عزیز، اشتراک شما تا {{end_date}} فعال است. برای تمدید با منشی تماس بگیرید.',
  },
  {
    id: 'debt',
    title: 'یادآوری بدهی',
    body: '{{name}}، مبلغ بدهی ثبت‌شده شما {{debt}} تومان است. لطفاً پیگیری کنید.',
  },
]

/**
 * @param {HTMLElement} root
 */
export function mountSmsTemplates(root) {
  root.innerHTML = `
    <article class="panel">
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
      <div class="list" data-list></div>
    </article>
  `

  const tag = /** @type {HTMLElement} */ (root.querySelector('[data-sms-tag]'))
  const hint = /** @type {HTMLElement} */ (root.querySelector('[data-sms-hint]'))
  const picker = /** @type {HTMLElement} */ (root.querySelector('[data-sms-picker]'))
  const memberInput = /** @type {HTMLInputElement} */ (root.querySelector('[data-sms-member-q]'))
  const memberLabel = /** @type {HTMLElement} */ (root.querySelector('[data-sms-member-label]'))
  const memberPick = /** @type {HTMLElement} */ (root.querySelector('[data-sms-member-pick]'))
  const resultEl = /** @type {HTMLElement} */ (root.querySelector('[data-sms-result]'))
  const list = /** @type {HTMLElement} */ (root.querySelector('[data-list]'))

  /** @type {{ id: number, display_id?: string, first_name?: string, last_name?: string, mobile?: string } | null} */
  let selected = null
  /** @type {boolean} */
  let enabled = false

  function setResult(text, ok) {
    resultEl.hidden = !text
    resultEl.textContent = text || ''
    resultEl.classList.toggle('ok', !!ok)
    resultEl.classList.toggle('err', text && !ok)
  }

  /**
   * @param {Array<{id: string, title: string, body: string}>} templates
   * @param {boolean} canSend
   */
  function renderList(templates, canSend) {
    list.innerHTML = templates
      .map(
        (t) => `<div class="row-item"><div>
      <h3>${t.title}</h3>
      <p>${t.body}</p>
    </div>
    <button type="button" class="btn small" data-sms-send="${t.id}" ${
          canSend ? '' : 'disabled'
        } title="${canSend ? 'ارسال به عضو انتخاب‌شده' : 'هنوز آماده نیست'}">ارسال</button></div>`,
      )
      .join('')

    list.querySelectorAll('[data-sms-send]').forEach((btn) => {
      btn.addEventListener('click', () => {
        void sendTemplate(/** @type {HTMLButtonElement} */ (btn).getAttribute('data-sms-send') || '')
      })
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
      const msg =
        err instanceof ApiError ? err.message : 'ارسال پیامک ناموفق بود.'
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
        'ارسال واقعی پیامک در این نسخه فعال نیست. دکمهٔ ارسال غیرفعال است.'
      picker.hidden = true
      renderList(FALLBACK_TEMPLATES, false)
      return
    }

    hint.textContent =
      'عضو را جستجو و انتخاب کنید، سپس روی ارسال بزنید. موبایل از پروندهٔ عضو خوانده می‌شود.'
    picker.hidden = false

    bindMemberSearch(memberPick, memberInput, (member) => {
      selected = member
      const name = `${member.first_name || ''} ${member.last_name || ''}`.trim()
      setPersonChip(memberLabel, member)
      memberInput.value = name
      setResult('', true)
    })

    let templates = FALLBACK_TEMPLATES
    try {
      const data = await apiGet('/api/v1/sms/templates')
      if (Array.isArray(data.items) && data.items.length) {
        templates = data.items
      }
    } catch {
      // keep fallback
    }
    renderList(templates, true)
  }

  void boot()
}
