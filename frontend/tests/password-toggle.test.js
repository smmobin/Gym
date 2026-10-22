import { describe, expect, it } from 'vitest'

import { enhancePasswordFields } from '../assets/js/password-toggle.js'

describe('enhancePasswordFields', () => {
  it('wraps password inputs and toggles visibility', () => {
    document.body.innerHTML = `
      <form>
        <label>رمز<input type="password" name="password" value="secret12" /></label>
        <label>دیگر<input type="text" name="other" /></label>
      </form>
    `
    const n = enhancePasswordFields(document)
    expect(n).toBe(1)

    const input = document.querySelector('input[name=password]')
    const btn = document.querySelector('.password-toggle')
    expect(input?.closest('.password-field')).toBeTruthy()
    expect(btn).toBeTruthy()
    expect(input?.type).toBe('password')

    btn?.dispatchEvent(new MouseEvent('click', { bubbles: true }))
    expect(input?.type).toBe('text')
    expect(btn?.getAttribute('aria-pressed')).toBe('true')
    expect(btn?.getAttribute('aria-label')).toContain('مخفی')

    btn?.dispatchEvent(new MouseEvent('click', { bubbles: true }))
    expect(input?.type).toBe('password')
    expect(btn?.getAttribute('aria-pressed')).toBe('false')
  })

  it('is idempotent', () => {
    document.body.innerHTML = `<input type="password" name="password" />`
    expect(enhancePasswordFields(document)).toBe(1)
    expect(enhancePasswordFields(document)).toBe(0)
    expect(document.querySelectorAll('.password-toggle')).toHaveLength(1)
  })
})
