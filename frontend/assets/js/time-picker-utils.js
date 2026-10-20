const FA_DIGITS = ['۰', '۱', '۲', '۳', '۴', '۵', '۶', '۷', '۸', '۹']

export function toFaDigits(value) {
  return String(value).replace(/\d/g, (d) => FA_DIGITS[Number(d)])
}

export function pad2(n) {
  return String(n).padStart(2, '0')
}

/** @param {string} value */
export function parseTime(value) {
  const m = String(value || '').trim().match(/^(\d{1,2}):(\d{2})/)
  if (!m) return { hour: 0, minute: 0 }
  const hour = Math.min(23, Math.max(0, Number(m[1])))
  const minute = Math.min(59, Math.max(0, Number(m[2])))
  return { hour, minute }
}

/** @param {number} hour @param {number} minute */
export function formatTime(hour, minute) {
  return `${pad2(hour)}:${pad2(minute)}`
}

/** @param {number} hour @param {number} minute */
export function displayTime(hour, minute) {
  return toFaDigits(`${pad2(hour)}:${pad2(minute)}`)
}
