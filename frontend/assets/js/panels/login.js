import { ApiError } from '../api.js'
import { fetchAthleteMe, athleteLogout } from '../auth-athlete.js'
import {
  fetchStaffMe,
  resolvePostLoginPath,
  roleLabel,
  staffLogout,
  unifiedLogin,
} from '../auth-staff.js'
import { mountNotificationBell } from '../notifications.js'
import { enhancePasswordFields } from '../password-toggle.js'
import { setStatus } from '../ui.js'

async function main() {
  enhancePasswordFields(document)
  const form = document.querySelector('[data-login-form]')
  const logged = document.querySelector('[data-logged]')
  const status = document.querySelector('[data-status]')
  const params = new URLSearchParams(location.search)
  const next = params.get('next')

  /**
   * @param {{ kind: string, role: string, user?: object, member?: object } | null} result
   * @param {object | null} [staffUser]
   * @param {object | null} [athleteMember]
   */
  async function showSession(result, staffUser, athleteMember) {
    const user = staffUser || (result?.kind === 'staff' ? result.user : null)
    const member = athleteMember || (result?.kind === 'athlete' ? result.member : null)

    if (!user && !member) {
      if (form) form.hidden = false
      if (logged) logged.hidden = true
      return
    }

    if (form) form.hidden = true
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
    }
  }

  form?.addEventListener('submit', async (e) => {
    e.preventDefault()
    const fd = new FormData(form)
    setStatus(/** @type {HTMLElement} */ (status), 'در حال ورود…', 'loading')
    try {
      const result = await unifiedLogin(String(fd.get('mobile')), String(fd.get('password')))
      setStatus(/** @type {HTMLElement} */ (status), '', '')
      form.querySelector('[name=password]').value = ''
      location.href = resolvePostLoginPath(result, next)
    } catch (err) {
      setStatus(
        /** @type {HTMLElement} */ (status),
        err instanceof ApiError ? err.message : 'ورود ناموفق بود. اتصال به سرور را بررسی کنید.',
        'error',
      )
      await showSession(null)
    }
  })

  document.querySelector('[data-logout]')?.addEventListener('click', async () => {
    try {
      const staffNow = await fetchStaffMe()
      if (staffNow) await staffLogout()
      else await athleteLogout()
    } finally {
      await showSession(null)
    }
  })
}

void main()
