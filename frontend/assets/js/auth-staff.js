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
 * Unified login (staff first, then athlete). Server sets the right cookie.
 * @param {string} mobile
 * @param {string} password
 * @returns {Promise<{ kind: 'staff' | 'athlete', role: string, user?: object, member?: object }>}
 */
export async function unifiedLogin(mobile, password) {
  return apiPost('/api/v1/auth/login', {
    mobile: mobile.trim(),
    password,
  })
}

/**
 * Staff-only helper (throws if the account is an athlete).
 * @param {string} mobile
 * @param {string} password
 */
export async function staffLogin(mobile, password) {
  const data = await unifiedLogin(mobile, password)
  if (data.kind !== 'staff' || !data.user) {
    throw new ApiError(403, 'این حساب کارکنان نیست.', data)
  }
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
  if (role === 'trainer') return '/trainer/'
  if (role === 'athlete') return '/athlete/'
  return '/login/'
}

/**
 * Home path after unified login result.
 * @param {{ kind: string, role: string }} result
 */
export function panelPathForLogin(result) {
  if (result.kind === 'athlete') return '/athlete/'
  return panelPathForRole(result.role)
}

/**
 * Honor ?next= only when it matches the authenticated role's panels.
 * @param {{ kind: string, role: string }} result
 * @param {string | null} next
 */
export function resolvePostLoginPath(result, next) {
  const home = panelPathForLogin(result)
  if (!next || !next.startsWith('/') || next.startsWith('//')) return home

  /** @type {string[]} */
  let allowed
  if (result.kind === 'athlete') {
    allowed = ['/athlete']
  } else if (result.role === 'manager') {
    allowed = ['/manager']
  } else if (result.role === 'receptionist') {
    allowed = ['/receptionist']
  } else if (result.role === 'trainer') {
    allowed = ['/trainer']
  } else {
    allowed = []
  }

  const ok = allowed.some(
    (p) => next === p || next === `${p}/` || next.startsWith(`${p}/`) || next.startsWith(`${p}#`),
  )
  return ok ? next : home
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
