/**
 * Show/hide toggle for password inputs (Ocean Dark MPA).
 * Idempotent: skips inputs already wrapped in .password-field.
 */

const ICON_SHOW = `<svg class="password-toggle-icon" viewBox="0 0 24 24" width="20" height="20" aria-hidden="true" focusable="false"><path fill="currentColor" d="M12 5c-7 0-10 7-10 7s3 7 10 7 10-7 10-7-3-7-10-7zm0 12a5 5 0 1 1 0-10 5 5 0 0 1 0 10zm0-8a3 3 0 1 0 0 6 3 3 0 0 0 0-6z"/></svg>`

const ICON_HIDE = `<svg class="password-toggle-icon" viewBox="0 0 24 24" width="20" height="20" aria-hidden="true" focusable="false"><path fill="currentColor" d="M3.1 4.5 4.5 3.1 20.9 19.5 19.5 20.9l-3.1-3.1A11.4 11.4 0 0 1 12 19c-7 0-10-7-10-7a18.6 18.6 0 0 1 5.1-5.6L3.1 4.5zM12 7a5 5 0 0 1 4.9 4.1l-1.6-1.6A3 3 0 0 0 12 9a3 3 0 0 0-2.5 4.6L8 12.1A5 5 0 0 1 12 7zm10 5s-1.2 2.8-3.8 4.9l-1.5-1.5A14.7 14.7 0 0 0 20.9 12 18.6 18.6 0 0 0 15 7.6l1.5-1.5C19.6 8.1 22 12 22 12z"/></svg>`

/**
 * @param {ParentNode} [root]
 * @returns {number} number of inputs enhanced
 */
export function enhancePasswordFields(root = document) {
  const inputs = root.querySelectorAll('input[type="password"]')
  let n = 0
  inputs.forEach((input) => {
    if (!(input instanceof HTMLInputElement)) return
    if (input.closest('.password-field')) return

    const wrap = document.createElement('span')
    wrap.className = 'password-field'
    input.parentNode?.insertBefore(wrap, input)
    wrap.appendChild(input)

    const btn = document.createElement('button')
    btn.type = 'button'
    btn.className = 'password-toggle'
    btn.setAttribute('aria-label', 'نمایش رمز')
    btn.setAttribute('aria-pressed', 'false')
    btn.setAttribute('tabindex', '0')
    btn.innerHTML = ICON_SHOW

    btn.addEventListener('click', () => {
      const showing = input.type === 'text'
      if (showing) {
        input.type = 'password'
        btn.setAttribute('aria-label', 'نمایش رمز')
        btn.setAttribute('aria-pressed', 'false')
        btn.innerHTML = ICON_SHOW
      } else {
        input.type = 'text'
        btn.setAttribute('aria-label', 'مخفی کردن رمز')
        btn.setAttribute('aria-pressed', 'true')
        btn.innerHTML = ICON_HIDE
      }
    })

    wrap.appendChild(btn)
    n += 1
  })
  return n
}
