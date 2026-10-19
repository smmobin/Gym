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
    location.href = '/athlete/login.html'
    return null
  }
  return member
}

export { ApiError }
