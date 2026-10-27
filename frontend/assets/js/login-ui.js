import { roleLabel } from './auth-staff.js'

/**
 * Show one wizard step; hide the rest. Must assign `.hidden` on a real HTMLElement
 * variable — never on a parenthesized JSDoc cast (that is invalid JS / PARSE_ERROR).
 * @param {HTMLElement | null} root
 * @param {'mobile'|'chooser'|'auth'} step
 */
export function showStep(root, step) {
  if (!root) return
  root.querySelectorAll('[data-step]').forEach((node) => {
    if (!(node instanceof HTMLElement)) return
    const match = node.getAttribute('data-step') === step
    node.hidden = !match
    node.classList.toggle('is-active', match)
  })
}

/**
 * @param {Document | Element} root
 * @param {'otp'|'password'} mode
 * @param {boolean} reduceMotion
 */
export function applyAuthMode(root, mode, reduceMotion = false) {
  const otpForm = root.querySelector('[data-otp-form]')
  const pwForm = root.querySelector('[data-password-form]')
  const panels = root.querySelector('[data-auth-panels]')
  if (!(otpForm instanceof HTMLElement) || !(pwForm instanceof HTMLElement)) return

  const showOtp = mode === 'otp'
  otpForm.hidden = !showOtp
  pwForm.hidden = showOtp
  otpForm.classList.toggle('is-active', showOtp)
  pwForm.classList.toggle('is-active', !showOtp)

  if (panels instanceof HTMLElement) {
    panels.dataset.mode = mode
    panels.classList.toggle('is-reduced-motion', reduceMotion)
  }

  const switchBtn = root.querySelector('[data-switch-method]')
  if (switchBtn instanceof HTMLElement) {
    switchBtn.textContent = showOtp
      ? 'ورود با رمز عبور'
      : 'ورود با کد پیامک'
  }
}

/**
 * @param {HTMLElement} listEl
 * @param {Array<{ kind: string, role: string, label: string }>} identities
 * @param {(identity: object) => void} onPick
 */
export function renderRoleChooser(listEl, identities, onPick) {
  listEl.replaceChildren()
  for (const identity of identities) {
    const btn = document.createElement('button')
    btn.type = 'button'
    btn.className = 'login-role-btn'
    btn.setAttribute('role', 'listitem')
    btn.textContent = identity.label || roleLabel(identity.role)
    btn.addEventListener('click', () => onPick(identity))
    listEl.appendChild(btn)
  }
}
