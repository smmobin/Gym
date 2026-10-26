import { ApiError } from '../api.js'
import { fetchAthleteMe, athleteLogout } from '../auth-athlete.js'
import {
  fetchStaffMe,
  lookupMobile,
  resolvePostLoginPath,
  roleLabel,
  sendLoginOtp,
  staffLogout,
  unifiedLogin,
  verifyLoginOtp,
} from '../auth-staff.js'
import {
  canUseOtp,
  canUsePassword,
  defaultAuthMode,
  reduceLoginStep,
  toggleAuthMode,
} from '../login-flow.js'
import { applyAuthMode, renderRoleChooser } from '../login-ui.js'
import { mountNotificationBell } from '../notifications.js'
import { enhanceMobileInputs } from '../mobile-input.js'
import { enhancePasswordFields } from '../password-toggle.js'
import { initThemeToggle } from '../theme.js'
import { setStatus } from '../ui.js'

/**
 * @param {HTMLElement | null} root
 * @param {'mobile'|'chooser'|'auth'} step
 */
function showStep(root, step) {
  if (!root) return
  root.querySelectorAll('[data-step]').forEach((el) => {
    const match = el.getAttribute('data-step') === step
    /** @type {HTMLElement} */ (el).hidden = !match
    el.classList.toggle('is-active', match)
  })
}

async function main() {
  initThemeToggle(document)
  enhancePasswordFields(document)
  enhanceMobileInputs(document)

  const wizard = document.querySelector('[data-login-wizard]')
  const logged = document.querySelector('[data-logged]')
  const status = document.querySelector('[data-status]')
  const lead = document.querySelector('[data-login-lead]')
  const params = new URLSearchParams(location.search)
  const next = params.get('next')
  const reduceMotion = window.matchMedia('(prefers-reduced-motion: reduce)').matches

  /** @type {{ step: 'mobile'|'chooser'|'auth', identities: object[], selected: object | null }} */
  let state = { step: 'mobile', identities: [], selected: null }
  let mobileValue = ''
  /** @type {'otp'|'password'} */
  let authMode = 'password'
  let otpDevHint = false
  let otpSentOnce = false

  /**
   * @param {{ kind: string, role: string, user?: object, member?: object } | null} result
   * @param {object | null} [staffUser]
   * @param {object | null} [athleteMember]
   */
  async function showSession(result, staffUser, athleteMember) {
    const user = staffUser || (result?.kind === 'staff' ? result.user : null)
    const member = athleteMember || (result?.kind === 'athlete' ? result.member : null)

    if (!user && !member) {
      if (wizard) wizard.hidden = false
      if (logged) logged.hidden = true
      return
    }

    if (wizard) wizard.hidden = true
    if (!logged) return
    logged.hidden = false

    if (user) {
      logged.querySelector('[data-name]').textContent = user.full_name
      logged.querySelector('[data-role]').textContent = roleLabel(user.role)
      logged.querySelector('[data-mobile]').textContent = user.mobile
      const go = logged.querySelector('[data-go]')
      if (go) {
        go.href = resolvePostLoginPath({ kind: 'staff', role: user.role }, next)
      }
    } else if (member) {
      logged.querySelector('[data-name]').textContent =
        `${member.first_name} ${member.last_name}`
      logged.querySelector('[data-role]').textContent = 'ورزشکار'
      logged.querySelector('[data-mobile]').textContent = member.mobile
      const go = logged.querySelector('[data-go]')
      if (go) go.href = resolvePostLoginPath({ kind: 'athlete', role: 'athlete' }, next)
    }

    const bell = logged.querySelector('[data-bell-root]')
    if (bell && user && !bell.dataset.ready) {
      mountNotificationBell(bell)
      bell.dataset.ready = '1'
    }
  }

  function paint() {
    showStep(/** @type {HTMLElement} */ (wizard), state.step)
    if (lead) {
      if (state.step === 'mobile') lead.textContent = 'شماره موبایل خود را وارد کنید.'
      else if (state.step === 'chooser') lead.textContent = 'این شماره چند نقش دارد؛ یکی را انتخاب کنید.'
      else lead.textContent = 'هویت انتخاب‌شده را تأیید کنید.'
    }

    const chooserMobile = document.querySelector('[data-chooser-mobile]')
    if (chooserMobile) chooserMobile.textContent = mobileValue ? `موبایل: ${mobileValue}` : ''

    if (state.step === 'auth' && state.selected) {
      const roleEl = document.querySelector('[data-auth-role-label]')
      const mobEl = document.querySelector('[data-auth-mobile]')
      if (roleEl) roleEl.textContent = `ورود به‌عنوان ${state.selected.label || roleLabel(state.selected.role)}`
      if (mobEl) mobEl.textContent = mobileValue

      const otpForm = document.querySelector('[data-otp-form]')
      const pwForm = document.querySelector('[data-password-form]')
      const switchWrap = document.querySelector('[data-method-switch]')
      const hint = document.querySelector('[data-otp-dev-hint]')

      const otpOk = canUseOtp(state.selected)
      const pwOk = canUsePassword(state.selected)
      if (otpForm instanceof HTMLElement) otpForm.hidden = authMode !== 'otp' || !otpOk
      if (pwForm instanceof HTMLElement) pwForm.hidden = authMode !== 'password' || !pwOk
      applyAuthMode(document, authMode, reduceMotion)

      if (switchWrap instanceof HTMLElement) {
        switchWrap.hidden = !(otpOk && pwOk)
      }
      if (hint instanceof HTMLElement) {
        hint.hidden = !(otpDevHint && authMode === 'otp' && otpOk)
      }
    }
  }

  /**
   * @param {object} identity
   */
  async function enterAuth(identity) {
    state = reduceLoginStep(state, { type: 'choose', identity })
    authMode = defaultAuthMode(identity)
    otpSentOnce = false
    paint()
    if (authMode === 'otp' && canUseOtp(identity)) {
      await requestOtp(false)
    }
  }

  /**
   * @param {boolean} isResend
   */
  async function requestOtp(isResend) {
    if (!state.selected) return
    setStatus(
      /** @type {HTMLElement} */ (status),
      isResend ? 'در حال ارسال مجدد کد…' : 'در حال ارسال کد…',
      'loading',
    )
    try {
      const res = await sendLoginOtp(mobileValue, {
        kind: state.selected.kind,
        role: state.selected.role,
      })
      otpSentOnce = true
      if (res.mode === 'dev_fixed') otpDevHint = true
      setStatus(
        /** @type {HTMLElement} */ (status),
        res.detail || 'کد ارسال شد.',
        'ok',
      )
      paint()
    } catch (err) {
      setStatus(
        /** @type {HTMLElement} */ (status),
        err instanceof ApiError ? err.message : 'ارسال کد ناموفق بود.',
        'error',
      )
      if (err instanceof ApiError && err.status === 403 && canUsePassword(state.selected)) {
        authMode = 'password'
        paint()
      }
    }
  }

  const staff = await fetchStaffMe()
  if (staff) {
    const path = resolvePostLoginPath({ kind: 'staff', role: staff.role }, next)
    if (next && path === next) {
      location.href = path
      return
    }
    await showSession({ kind: 'staff', role: staff.role, user: staff }, staff, null)
  } else {
    const athlete = await fetchAthleteMe()
    if (athlete) {
      const path = resolvePostLoginPath({ kind: 'athlete', role: 'athlete' }, next)
      if (next && path === next) {
        location.href = path
        return
      }
      await showSession({ kind: 'athlete', role: 'athlete', member: athlete }, null, athlete)
    } else {
      await showSession(null)
      paint()
    }
  }

  document.querySelector('[data-mobile-form]')?.addEventListener('submit', async (e) => {
    e.preventDefault()
    const form = /** @type {HTMLFormElement} */ (e.currentTarget)
    const fd = new FormData(form)
    mobileValue = String(fd.get('mobile') || '').trim()
    setStatus(/** @type {HTMLElement} */ (status), 'در حال بررسی موبایل…', 'loading')
    try {
      const data = await lookupMobile(mobileValue)
      otpDevHint = Boolean(data.otp_dev_hint)
      state = reduceLoginStep(state, { type: 'lookup_ok', identities: data.identities })
      setStatus(/** @type {HTMLElement} */ (status), '', '')
      if (state.step === 'chooser') {
        const list = document.querySelector('[data-role-list]')
        if (list instanceof HTMLElement) {
          renderRoleChooser(list, data.identities, (identity) => {
            void enterAuth(identity)
          })
        }
        paint()
      } else if (state.selected) {
        await enterAuth(state.selected)
      }
    } catch (err) {
      setStatus(
        /** @type {HTMLElement} */ (status),
        err instanceof ApiError ? err.message : 'بررسی موبایل ناموفق بود.',
        'error',
      )
      state = reduceLoginStep(state, { type: 'reset' })
      paint()
    }
  })

  document.querySelector('[data-password-form]')?.addEventListener('submit', async (e) => {
    e.preventDefault()
    if (!state.selected) return
    const form = /** @type {HTMLFormElement} */ (e.currentTarget)
    const fd = new FormData(form)
    setStatus(/** @type {HTMLElement} */ (status), 'در حال ورود…', 'loading')
    try {
      const result = await unifiedLogin(mobileValue, String(fd.get('password')), {
        kind: state.selected.kind,
        role: state.selected.role,
      })
      setStatus(/** @type {HTMLElement} */ (status), '', '')
      form.querySelector('[name=password]').value = ''
      location.href = resolvePostLoginPath(result, next)
    } catch (err) {
      setStatus(
        /** @type {HTMLElement} */ (status),
        err instanceof ApiError ? err.message : 'ورود ناموفق بود.',
        'error',
      )
    }
  })

  document.querySelector('[data-otp-form]')?.addEventListener('submit', async (e) => {
    e.preventDefault()
    if (!state.selected) return
    const form = /** @type {HTMLFormElement} */ (e.currentTarget)
    const fd = new FormData(form)
    setStatus(/** @type {HTMLElement} */ (status), 'در حال تأیید کد…', 'loading')
    try {
      if (!otpSentOnce) await requestOtp(false)
      const result = await verifyLoginOtp(mobileValue, String(fd.get('otp')), {
        kind: state.selected.kind,
        role: state.selected.role,
      })
      setStatus(/** @type {HTMLElement} */ (status), '', '')
      location.href = resolvePostLoginPath(result, next)
    } catch (err) {
      setStatus(
        /** @type {HTMLElement} */ (status),
        err instanceof ApiError ? err.message : 'تأیید کد ناموفق بود.',
        'error',
      )
    }
  })

  document.querySelector('[data-resend-otp]')?.addEventListener('click', () => {
    void requestOtp(true)
  })

  document.querySelector('[data-switch-method]')?.addEventListener('click', () => {
    if (!state.selected) return
    authMode = toggleAuthMode(authMode, state.selected)
    setStatus(/** @type {HTMLElement} */ (status), '', '')
    paint()
    if (authMode === 'otp' && !otpSentOnce) {
      void requestOtp(false)
    }
  })

  document.querySelector('[data-back-mobile]')?.addEventListener('click', () => {
    state = reduceLoginStep(state, { type: 'back_mobile' })
    setStatus(/** @type {HTMLElement} */ (status), '', '')
    paint()
  })

  document.querySelector('[data-back-from-auth]')?.addEventListener('click', () => {
    state = reduceLoginStep(state, { type: 'back_chooser' })
    setStatus(/** @type {HTMLElement} */ (status), '', '')
    if (state.step === 'chooser') {
      const list = document.querySelector('[data-role-list]')
      if (list instanceof HTMLElement) {
        renderRoleChooser(list, state.identities, (identity) => {
          void enterAuth(identity)
        })
      }
    }
    paint()
  })

  document.querySelector('[data-logout]')?.addEventListener('click', async () => {
    try {
      const staffNow = await fetchStaffMe()
      if (staffNow) await staffLogout()
      else await athleteLogout()
    } finally {
      state = reduceLoginStep(state, { type: 'reset' })
      await showSession(null)
      paint()
    }
  })
}

void main()
