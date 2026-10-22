import { afterEach, describe, expect, it } from 'vitest'

import {
  enhanceMoneyInputs,
  formatMoneyGrouped,
  moneyFromForm,
  parseMoneyInput,
  setMoneyInput,
  toAsciiDigits,
} from '../assets/js/money-input.js'

describe('money-input', () => {
  afterEach(() => {
    document.body.innerHTML = ''
  })

  it('parses Latin and Persian digits with separators', () => {
    expect(toAsciiDigits('۱۲۳')).toBe('123')
    expect(parseMoneyInput('1,250,000')).toBe(1_250_000)
    expect(parseMoneyInput('۱٬۲۵۰٬۰۰۰')).toBe(1_250_000)
    expect(parseMoneyInput('')).toBe(0)
    expect(formatMoneyGrouped(1_250_000)).toBe('1,250,000')
    expect(formatMoneyGrouped(0)).toBe('0')
  })

  it('formats while typing and reads from FormData', () => {
    document.body.innerHTML = `
      <form>
        <input data-money name="amount" value="0" />
      </form>
    `
    enhanceMoneyInputs(document.body)
    const input = /** @type {HTMLInputElement} */ (document.querySelector('[data-money]'))
    expect(input.type).toBe('text')
    expect(input.value).toBe('0')

    input.value = '1500000'
    input.dispatchEvent(new Event('input', { bubbles: true }))
    expect(input.value).toBe('1,500,000')

    setMoneyInput(input, 2_000_000)
    expect(input.value).toBe('2,000,000')

    const form = /** @type {HTMLFormElement} */ (document.querySelector('form'))
    expect(moneyFromForm(new FormData(form), 'amount')).toBe(2_000_000)
  })
})
