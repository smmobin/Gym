/** Compact Jalali ↔ Gregorian helpers (no dependencies). */

const FA_DIGITS = ['۰', '۱', '۲', '۳', '۴', '۵', '۶', '۷', '۸', '۹']

export const JALALI_MONTHS = [
  'فروردین',
  'اردیبهشت',
  'خرداد',
  'تیر',
  'مرداد',
  'شهریور',
  'مهر',
  'آبان',
  'آذر',
  'دی',
  'بهمن',
  'اسفند',
]

export const JALALI_WEEKDAYS = ['ش', 'ی', 'د', 'س', 'چ', 'پ', 'ج']

export function toFaDigits(value) {
  return String(value).replace(/\d/g, (d) => FA_DIGITS[Number(d)])
}

export function pad2(n) {
  return String(n).padStart(2, '0')
}

function div(a, b) {
  return Math.trunc(a / b)
}

/** @param {number} jy */
export function isJalaliLeap(jy) {
  const breaks = [
    -61, 9, 38, 199, 426, 686, 756, 818, 1111, 1181, 1210, 1635, 2060, 2097, 2192, 2262, 2324, 2394,
    2456, 3178,
  ]
  const bl = breaks.length
  let jp = breaks[0]
  let jump = 0
  for (let i = 1; i < bl; i += 1) {
    const jm = breaks[i]
    jump = jm - jp
    if (jy < jm) break
    jp = jm
  }
  let n = jy - jp
  if (jump - n < 6) n = n - jump + div(jump + 4, 33) * 33
  let leap = ((((n + 1) % 33) - 1) % 4)
  if (leap === -1) leap = 4
  return leap === 0
}

/** @param {number} jy @param {number} jm */
export function jalaliMonthLength(jy, jm) {
  if (jm <= 6) return 31
  if (jm <= 11) return 30
  return isJalaliLeap(jy) ? 30 : 29
}

/**
 * @param {number} gy
 * @param {number} gm 1-12
 * @param {number} gd
 * @returns {[number, number, number]}
 */
export function gregorianToJalali(gy, gm, gd) {
  const g_d_m = [0, 31, 59, 90, 120, 151, 181, 212, 243, 273, 304, 334]
  const gy2 = gm > 2 ? gy + 1 : gy
  let days =
    355666 +
    365 * gy +
    div(gy2 + 3, 4) -
    div(gy2 + 99, 100) +
    div(gy2 + 399, 400) +
    gd +
    g_d_m[gm - 1]
  let jy = -1595 + 33 * div(days, 12053)
  days %= 12053
  jy += 4 * div(days, 1461)
  days %= 1461
  if (days > 365) {
    jy += div(days - 1, 365)
    days = (days - 1) % 365
  }
  let jm
  let jd
  if (days < 186) {
    jm = 1 + div(days, 31)
    jd = 1 + (days % 31)
  } else {
    jm = 7 + div(days - 186, 30)
    jd = 1 + ((days - 186) % 30)
  }
  return [jy, jm, jd]
}

/**
 * @param {number} jy
 * @param {number} jm 1-12
 * @param {number} jd
 * @returns {[number, number, number]}
 */
export function jalaliToGregorian(jy, jm, jd) {
  const jy2 = jy + 1595
  let days =
    -355668 +
    365 * jy2 +
    div(jy2, 33) * 8 +
    div((jy2 % 33) + 3, 4) +
    jd +
    (jm < 7 ? (jm - 1) * 31 : (jm - 7) * 30 + 186)
  let gy = 400 * div(days, 146097)
  days %= 146097
  if (days > 36524) {
    gy += 100 * div(--days, 36524)
    days %= 36524
    if (days >= 365) days += 1
  }
  gy += 4 * div(days, 1461)
  days %= 1461
  if (days > 365) {
    gy += div(days - 1, 365)
    days = (days - 1) % 365
  }
  let gd = days + 1
  const sal_a = [
    0,
    31,
    (gy % 4 === 0 && gy % 100 !== 0) || gy % 400 === 0 ? 29 : 28,
    31,
    30,
    31,
    30,
    31,
    31,
    30,
    31,
    30,
    31,
  ]
  let gm = 0
  for (gm = 1; gm <= 12 && gd > sal_a[gm]; gm += 1) gd -= sal_a[gm]
  return [gy, gm, gd]
}

/** @param {string} iso YYYY-MM-DD */
export function parseIsoDate(iso) {
  const m = String(iso || '')
    .trim()
    .match(/^(\d{4})-(\d{2})-(\d{2})/)
  if (!m) return null
  return { y: Number(m[1]), m: Number(m[2]), d: Number(m[3]) }
}

/** @param {string} value datetime-local or date */
export function parseDateTimeLocal(value) {
  const m = String(value || '')
    .trim()
    .match(/^(\d{4})-(\d{2})-(\d{2})(?:T(\d{2}):(\d{2}))?/)
  if (!m) return null
  return {
    y: Number(m[1]),
    m: Number(m[2]),
    d: Number(m[3]),
    hour: m[4] != null ? Number(m[4]) : 0,
    minute: m[5] != null ? Number(m[5]) : 0,
  }
}

/** @param {number} y @param {number} m @param {number} d */
export function formatIsoDate(y, m, d) {
  return `${y}-${pad2(m)}-${pad2(d)}`
}

/** @param {number} y @param {number} m @param {number} d @param {number} hour @param {number} minute */
export function formatDateTimeLocal(y, m, d, hour, minute) {
  return `${formatIsoDate(y, m, d)}T${pad2(hour)}:${pad2(minute)}`
}

/** @param {number} gy @param {number} gm @param {number} gd */
export function displayJalali(gy, gm, gd) {
  const [jy, jm, jd] = gregorianToJalali(gy, gm, gd)
  return toFaDigits(`${jd} ${JALALI_MONTHS[jm - 1]} ${jy}`)
}

/** Saturday-based weekday index 0..6 for a Gregorian date */
export function saturdayIndex(gy, gm, gd) {
  const dow = new Date(gy, gm - 1, gd).getDay()
  return (dow + 1) % 7
}
