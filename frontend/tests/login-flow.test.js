import { describe, expect, it } from 'vitest'

import {
  canUseOtp,
  canUsePassword,
  defaultAuthMode,
  needsRoleChooser,
  reduceLoginStep,
  singleIdentity,
  toggleAuthMode,
} from '../assets/js/login-flow.js'
import { applyAuthMode, renderRoleChooser } from '../assets/js/login-ui.js'

const manager = {
  kind: 'staff',
  role: 'manager',
  label: 'مدیر',
  auth_methods: ['password'],
  has_password: true,
}
const trainer = {
  kind: 'staff',
  role: 'trainer',
  label: 'مربی',
  auth_methods: ['otp', 'password'],
  has_password: true,
}
const athlete = {
  kind: 'athlete',
  role: 'athlete',
  label: 'ورزشکار',
  auth_methods: ['otp', 'password'],
  has_password: true,
}

describe('login-flow helpers', () => {
  it('mobile step: single identity skips chooser', () => {
    expect(needsRoleChooser([manager])).toBe(false)
    expect(singleIdentity([manager])).toEqual(manager)
    const next = reduceLoginStep(
      { step: 'mobile', identities: [], selected: null },
      { type: 'lookup_ok', identities: [manager] },
    )
    expect(next.step).toBe('auth')
    expect(next.selected).toEqual(manager)
  })

  it('shows chooser when staff+athlete both exist', () => {
    const identities = [manager, athlete]
    expect(needsRoleChooser(identities)).toBe(true)
    const next = reduceLoginStep(
      { step: 'mobile', identities: [], selected: null },
      { type: 'lookup_ok', identities },
    )
    expect(next.step).toBe('chooser')
    expect(next.selected).toBeNull()
  })

  it('defaults manager to password and trainer/athlete to otp', () => {
    expect(defaultAuthMode(manager)).toBe('password')
    expect(defaultAuthMode(trainer)).toBe('otp')
    expect(defaultAuthMode(athlete)).toBe('otp')
    expect(canUseOtp(manager)).toBe(false)
    expect(canUsePassword(trainer)).toBe(true)
  })

  it('toggles otp ↔ password for trainer', () => {
    expect(toggleAuthMode('otp', trainer)).toBe('password')
    expect(toggleAuthMode('password', trainer)).toBe('otp')
    expect(toggleAuthMode('otp', manager)).toBe('password')
  })
})

describe('login UI helpers', () => {
  it('renders mobile-only field markup expectations', () => {
    document.body.innerHTML = `
      <section data-step="mobile" class="login-step is-active">
        <form data-mobile-form>
          <label class="login-mobile-field">موبایل
            <input name="mobile" type="tel" required />
          </label>
          <button type="submit">ادامه</button>
        </form>
      </section>
      <section data-step="chooser" hidden></section>
    `
    const mobileStep = document.querySelector('[data-step="mobile"]')
    const chooser = document.querySelector('[data-step="chooser"]')
    expect(mobileStep?.querySelector('[name=mobile]')).toBeTruthy()
    expect(mobileStep?.querySelector('[name=password]')).toBeNull()
    expect(chooser?.hidden).toBe(true)
  })

  it('renderRoleChooser lists real identities', () => {
    document.body.innerHTML = `<div data-role-list></div>`
    const list = document.querySelector('[data-role-list]')
    const picked = []
    renderRoleChooser(list, [trainer, athlete], (id) => picked.push(id.role))
    const buttons = list.querySelectorAll('.login-role-btn')
    expect(buttons).toHaveLength(2)
    expect(buttons[0].textContent).toContain('مربی')
    expect(buttons[1].textContent).toContain('ورزشکار')
    buttons[1].dispatchEvent(new MouseEvent('click', { bubbles: true }))
    expect(picked).toEqual(['athlete'])
  })

  it('applyAuthMode switches otp and password panels', () => {
    document.body.innerHTML = `
      <div data-auth-panels>
        <form data-otp-form class="login-auth-panel"></form>
        <form data-password-form class="login-auth-panel" hidden></form>
        <div data-method-switch>
          <button type="button" data-switch-method></button>
        </div>
      </div>
    `
    applyAuthMode(document, 'otp', false)
    expect(document.querySelector('[data-otp-form]')?.classList.contains('is-active')).toBe(true)
    expect(document.querySelector('[data-password-form]')?.hidden).toBe(true)
    expect(document.querySelector('[data-switch-method]')?.textContent).toContain('رمز')

    applyAuthMode(document, 'password', true)
    expect(document.querySelector('[data-password-form]')?.classList.contains('is-active')).toBe(true)
    expect(document.querySelector('[data-otp-form]')?.hidden).toBe(true)
    expect(document.querySelector('[data-auth-panels]')?.classList.contains('is-reduced-motion')).toBe(
      true,
    )
    expect(document.querySelector('[data-switch-method]')?.textContent).toContain('پیامک')
  })
})
