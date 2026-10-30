/** Iranian mobile UX: digits only, max 11, Persian/Arabic numerals → ASCII. */

const PERSIAN_DIGITS = '۰۱۲۳۴۵۶۷۸۹'
const ARABIC_DIGITS = '٠١٢٣٤٥٦٧٨٩'

/**
 * @param {string} value
 * @returns {string} ASCII digits only
 */
export function toAsciiDigits(value) {
  return String(value || '')
    .split('')
    .map((ch) => {
      const p = PERSIAN_DIGITS.indexOf(ch)
      if (p >= 0) return String(p)
      const a = ARABIC_DIGITS.indexOf(ch)
      if (a >= 0) return String(a)
      return ch
    })
    .join('')
}

/**
 * @param {string} value
 * @param {{ maxLength?: number }} [opts]
 * @returns {string}
 */
export function sanitizeMobileInput(value, opts = {}) {
  const maxLength = opts.maxLength ?? 11
  const digits = toAsciiDigits(value).replace(/\D/g, '')
  return digits.slice(0, maxLength)
}

/**
 * Bind maxlength + live digit filter on mobile fields.
 * @param {ParentNode} [root]
 * @param {{ maxLength?: number, selector?: string }} [opts]
 */
export function enhanceMobileInputs(root = document, opts = {}) {
  const maxLength = opts.maxLength ?? 11
  const selector = opts.selector || 'input[name="mobile"], input[data-mobile-input]'
  root.querySelectorAll(selector).forEach((el) => {
    if (!(el instanceof HTMLInputElement)) return
    if (el.dataset.mobileEnhanced === '1') return
    el.dataset.mobileEnhanced = '1'
    el.setAttribute('inputmode', 'numeric')
    el.setAttribute('autocomplete', el.getAttribute('autocomplete') || 'tel')
    el.setAttribute('maxlength', String(maxLength))
    if (!el.getAttribute('minlength')) el.setAttribute('minlength', String(maxLength))
    if (!el.getAttribute('pattern')) el.setAttribute('pattern', '09[0-9]{9}')
    if (!el.getAttribute('title')) {
      el.setAttribute('title', 'موبایل ۱۱ رقمی با ۰۹ (مثلاً ۰۹۱۲۱۲۳۴۵۶۷)')
    }

    const apply = () => {
      const next = sanitizeMobileInput(el.value, { maxLength })
      if (el.value !== next) el.value = next
    }
    el.addEventListener('input', apply)
    el.addEventListener('paste', () => {
      // After paste settles, strip non-digits and enforce max length.
      setTimeout(apply, 0)
    })
    el.addEventListener('blur', apply)
    apply()
  })
}
