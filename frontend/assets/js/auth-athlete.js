import { ApiError, apiGet, apiPost } from './api.js'

export async function fetchAthleteMe() {
  try {
    const data = await apiGet('/api/v1/athlete/auth/me')
    return data.member
  } catch {
    return null
  }
}

/**
 * Prefer unified login at /api/v1/auth/login; this path remains for API parity.
 * @param {string} mobile
 * @param {string} password
 */
export async function athleteLogin(mobile, password) {
  const data = await apiPost('/api/v1/athlete/auth/login', {
    mobile: mobile.trim(),
    password,
  })
  return data.member
}

export async function athleteLogout() {
  await apiPost('/api/v1/athlete/auth/logout')
}

export async function requireAthlete() {
  const member = await fetchAthleteMe()
  if (!member) {
    const next = encodeURIComponent(location.pathname + location.hash)
    location.href = `/login/?next=${next}`
    return null
  }
  return member
}

export { ApiError }
