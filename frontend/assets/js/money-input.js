/**
 * Live thousand-grouped toman inputs (type=text + inputmode=numeric).
 * Accepts Latin and Persian/Arabic digits; stores display as 1,000,000.
 */

const DIGIT_MAP = {
  '۰': '0',
  '۱': '1',
  '۲': '2',
  '۳': '3',
  '۴': '4',
  '۵': '5',
  '۶': '6',
  '۷': '7',
  '۸': '8',
  '۹': '9',
  '٠': '0',
  '١': '1',
  '٢': '2',
  '٣': '3',
  '٤': '4',
  '٥': '5',
  '٦': '6',
  '٧': '7',
  '٨': '8',
  '٩': '9',
}

/** @param {string} s */
export function toAsciiDigits(s) {
  return String(s).replace(/[۰-۹٠-٩]/g, (ch) => DIGIT_MAP[ch] || ch)
}

/** Digits only from a money field value (no separators). */
export function moneyDigits(value) {
  return toAsciiDigits(value ?? '').replace(/\D/g, '')
}

/**
 * @param {unknown} value
 * @returns {number}
 */
export function parseMoneyInput(value) {
  const digits = moneyDigits(value)
  if (!digits) return 0
  const n = Number(digits)
  return Number.isFinite(n) ? n : 0
}

/**
 * Grouped display for typing (Latin digits + comma).
 * @param {unknown} value
 */
export function formatMoneyGrouped(value) {
  const n = typeof value === 'number' ? value : parseMoneyInput(value)
  if (!Number.isFinite(n) || n < 0) return ''
  return Math.trunc(n).toLocaleString('en-US')
}

/**
 * @param {HTMLInputElement} input
 * @param {unknown} value
 */
export function setMoneyInput(input, value) {
  const digits = moneyDigits(value)
  input.value = digits ? formatMoneyGrouped(Number(digits)) : ''
}

/**
 * Read amount from FormData or a named control.
 * @param {FormData | HTMLFormElement} source
 * @param {string} name
 */
export function moneyFromForm(source, name) {
  if (source instanceof FormData) return parseMoneyInput(source.get(name))
  const el = source.elements.namedItem(name)
  if (el instanceof HTMLInputElement) return parseMoneyInput(el.value)
  return 0
}

/**
 * @param {HTMLInputElement} input
 */
export function bindMoneyInput(input) {
  if (!(input instanceof HTMLInputElement)) return
  if (input.dataset.moneyBound === '1') return
  input.dataset.moneyBound = '1'
  input.setAttribute('data-money', '')
  input.type = 'text'
  input.setAttribute('inputmode', 'numeric')
  input.setAttribute('autocomplete', 'off')
  input.setAttribute('spellcheck', 'false')

  if (input.value !== '') setMoneyInput(input, input.value)

  input.addEventListener('input', () => {
    const raw = input.value
    const caret = input.selectionStart ?? raw.length
    const digitsBefore = moneyDigits(raw.slice(0, caret)).length
    const digits = moneyDigits(raw)
    input.value = digits ? formatMoneyGrouped(Number(digits)) : ''

    let pos = 0
    let seen = 0
    const v = input.value
    while (pos < v.length && seen < digitsBefore) {
      if (/\d/.test(v[pos])) seen += 1
      pos += 1
    }
    try {
      input.setSelectionRange(pos, pos)
    } catch {
      /* ignore */
    }
  })

  input.addEventListener('blur', () => {
    if (!moneyDigits(input.value)) {
      if (input.required) return
      return
    }
    setMoneyInput(input, parseMoneyInput(input.value))
  })
}

/**
 * Enhance all `[data-money]` inputs under root (idempotent).
 * @param {ParentNode} [root]
 */
export function enhanceMoneyInputs(root = document) {
  root.querySelectorAll('input[data-money]').forEach((el) => {
    if (el instanceof HTMLInputElement) bindMoneyInput(el)
  })
}
