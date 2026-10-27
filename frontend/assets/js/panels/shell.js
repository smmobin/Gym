import { staffLogout, roleLabel } from '../auth-staff.js'
import { mountNotificationBell } from '../notifications.js'
import { mountTodayDate } from '../format.js'
import { startSessionActivityGuard } from '../session-activity.js'
import { initThemeToggle } from '../theme.js'
import { bindHashNav, bindSidebarClose, showApiDown } from '../ui.js'
import { apiGet } from '../api.js'

/**
 * @param {{
 *   user: { full_name: string, role: string, mobile: string },
 *   defaultHash?: string,
 *   allowReports?: boolean,
 * }} opts
 */
export async function initStaffShell(opts) {
  initThemeToggle(document)
  bindSidebarClose()
  bindHashNav(opts.defaultHash || 'dash')

  const nameEl = document.querySelector('[data-user-name]')
  const roleEl = document.querySelector('[data-user-role]')
  if (nameEl) nameEl.textContent = opts.user.full_name
  if (roleEl) roleEl.textContent = roleLabel(opts.user.role)

  const avatar = document.querySelector('[data-avatar]')
  if (avatar) {
    const parts = opts.user.full_name.trim().split(/\s+/)
    avatar.textContent = (parts[0]?.[0] || '') + (parts[1]?.[0] || '')
  }

  mountTodayDate()

  const bellRoot = document.querySelector('[data-bell-root]')
  if (bellRoot) mountNotificationBell((bellRoot))

  document.querySelector('[data-logout]')?.addEventListener('click', async () => {
    try {
      await staffLogout()
    } finally {
      location.href = '/login/'
    }
  })

  startSessionActivityGuard({
    touchPath: '/api/v1/auth/touch',
    logoutPath: '/api/v1/auth/logout',
  })

  // Hide manager-only nav for non-managers
  document.querySelectorAll('[data-manager-only]').forEach((el) => {
    if (opts.user.role !== 'manager') el.hidden = true
  })
  document.querySelectorAll('[data-desk-only]').forEach((el) => {
    if (opts.user.role === 'trainer') el.hidden = true
  })

  const banner = document.querySelector('[data-api-banner]')
  try {
    await apiGet('/api/v1/health')
    showApiDown(/** @type {HTMLElement} */ (banner), false)
  } catch {
    showApiDown(/** @type {HTMLElement} */ (banner), true)
  }
}
