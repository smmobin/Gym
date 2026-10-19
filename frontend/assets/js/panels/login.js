import { ApiError } from '../api.js'
import {
  fetchStaffMe,
  panelPathForRole,
  roleLabel,
  staffLogin,
  staffLogout,
} from '../auth-staff.js'
import { mountNotificationBell } from '../notifications.js'
import { setStatus } from '../ui.js'

async function main() {
  const form = document.querySelector('[data-login-form]')
  const logged = document.querySelector('[data-logged]')
  const status = document.querySelector('[data-status]')
  const params = new URLSearchParams(location.search)
  const next = params.get('next')

  async function showUser(user) {
    if (!user) {
      form.hidden = false
      if (logged) logged.hidden = true
      return
    }
    form.hidden = true
    if (logged) {
      logged.hidden = false
      logged.querySelector('[data-name]').textContent = user.full_name
      logged.querySelector('[data-role]').textContent = roleLabel(user.role)
      logged.querySelector('[data-mobile]').textContent = user.mobile
      const go = logged.querySelector('[data-go]')
      if (go) {
        const path = next && next.startsWith('/') ? next : panelPathForRole(user.role)
        go.href = path
      }
      const bell = logged.querySelector('[data-bell-root]')
      if (bell && !bell.dataset.ready) {
        mountNotificationBell(bell)
        bell.dataset.ready = '1'
      }
    }
  }

  const me = await fetchStaffMe()
  await showUser(me)
  if (me && next && next.startsWith('/')) {
    // optional auto-redirect when returning from requireStaff
  }

  form?.addEventListener('submit', async (e) => {
    e.preventDefault()
    const fd = new FormData(form)
    setStatus((status), 'در حال ورود…', 'loading')
    try {
      const user = await staffLogin(String(fd.get('mobile')), String(fd.get('password')))
      setStatus((status), '', '')
      form.querySelector('[name=password]').value = ''
      const path = next && next.startsWith('/') ? next : panelPathForRole(user.role)
      location.href = path
    } catch (err) {
      setStatus(
        /** @type {HTMLElement} */ (status),
        err instanceof ApiError ? err.message : 'ورود ناموفق بود. اتصال به سرور را بررسی کنید.',
        'error',
      )
      await showUser(null)
    }
  })

  document.querySelector('[data-logout]')?.addEventListener('click', async () => {
    try {
      await staffLogout()
    } finally {
      await showUser(null)
    }
  })
}

void main()
