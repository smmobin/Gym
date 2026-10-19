import { ApiError, apiGet, apiPost } from './api.js'
import { ROLE_LABEL } from './format.js'

/**
 * @returns {Promise<object | null>}
 */
export async function fetchStaffMe() {
  try {
    const data = await apiGet('/api/v1/auth/me')
    return data.user
  } catch {
    return null
  }
}

/**
 * @param {string} mobile
 * @param {string} password
 */
export async function staffLogin(mobile, password) {
  const data = await apiPost('/api/v1/auth/login', {
    mobile: mobile.trim(),
    password,
  })
  return data.user
}

export async function staffLogout() {
  await apiPost('/api/v1/auth/logout')
}

/**
 * Redirect helpers for role-based home panels.
 * @param {string} role
 */
export function panelPathForRole(role) {
  if (role === 'manager') return '/manager/'
  if (role === 'receptionist') return '/receptionist/'
  if (role === 'trainer') return '/receptionist/#workouts'
  return '/login/'
}

/**
 * Require staff session; redirect to login if missing.
 * Optionally restrict by roles.
 * @param {string[]} [roles]
 */
export async function requireStaff(roles) {
  const user = await fetchStaffMe()
  if (!user) {
    const next = encodeURIComponent(location.pathname + location.hash)
    location.href = `/login/?next=${next}`
    return null
  }
  if (roles && roles.length && !roles.includes(user.role)) {
    location.href = panelPathForRole(user.role)
    return null
  }
  return user
}

export function roleLabel(role) {
  return ROLE_LABEL[role] ?? role
}

export { ApiError }
