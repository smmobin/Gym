import { afterEach, describe, expect, it } from 'vitest'

import {
  enhanceMobileInputs,
  sanitizeMobileInput,
  toAsciiDigits,
} from '../assets/js/mobile-input.js'

describe('mobile input', () => {
  afterEach(() => {
    document.body.innerHTML = ''
  })

  it('converts Persian digits and strips non-digits to max 11', () => {
    expect(toAsciiDigits('۰۹۱۲')).toBe('0912')
    expect(sanitizeMobileInput('09-12 345-6789abc')).toBe('09123456789')
    expect(sanitizeMobileInput('091234567890123')).toBe('09123456789')
    expect(sanitizeMobileInput('۰۹۱۲۱۲۳۴۵۶۷۸۹۹')).toBe('09121234567')
  })

  it('enhanceMobileInputs sets maxlength and filters typing', () => {
    document.body.innerHTML = `<input name="mobile" />`
    enhanceMobileInputs(document)
    const input = /** @type {HTMLInputElement} */ (document.querySelector('[name=mobile]'))
    expect(input.maxLength).toBe(11)
    expect(input.getAttribute('pattern')).toBe('09[0-9]{9}')
    input.value = '091212345678999'
    input.dispatchEvent(new Event('input'))
    expect(input.value).toBe('09121234567')
  })

  it('desk panels wire enhanceMobileInputs on member/staff/guest forms', async () => {
    const { readFileSync } = await import('node:fs')
    const { dirname, join } = await import('node:path')
    const { fileURLToPath } = await import('node:url')
    const root = join(dirname(fileURLToPath(import.meta.url)), '..', 'assets/js')
    for (const file of ['members.js', 'staff.js', 'guests.js']) {
      const src = readFileSync(join(root, file), 'utf8')
      expect(src, file).toMatch(/enhanceMobileInputs/)
      expect(src, file).toMatch(/maxlength="11"/)
    }
  })
})
