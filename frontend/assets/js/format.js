import {
  JALALI_MONTHS,
  formatIsoDate,
  gregorianToJalali,
  jalaliMonthLength,
  jalaliToGregorian,
  parseIsoDate,
  toFaDigits,
} from './jalali-utils.js'

/** Full weekday names (Saturday-first, matching Jalali week). */
export const JALALI_WEEKDAY_NAMES = [
  'شنبه',
  'یکشنبه',
  'دوشنبه',
  'سه‌شنبه',
  'چهارشنبه',
  'پنجشنبه',
  'جمعه',
]

/** @param {number} n */
export function formatToman(n) {
  return `${Number(n || 0).toLocaleString('fa-IR')} تومان`
}

/**
 * @param {Date} [now]
 * @returns {{ y: number, m: number, d: number }}
 */
function localYmd(now = new Date()) {
  return { y: now.getFullYear(), m: now.getMonth() + 1, d: now.getDate() }
}

/** @param {Date} [now] */
export function isoDateLocal(now = new Date()) {
  const { y, m, d } = localYmd(now)
  return formatIsoDate(y, m, d)
}

/** Default report range: today → today (local / Tehran wall clock). */
export function todayRangeLocal(now = new Date()) {
  const iso = isoDateLocal(now)
  return { from: iso, to: iso }
}

/**
 * Current Jalali month as Gregorian ISO bounds (for dashboard «ماه»).
 * @param {Date} [now]
 */
export function jalaliMonthRangeLocal(now = new Date()) {
  const { y, m, d } = localYmd(now)
  const [jy, jm] = gregorianToJalali(y, m, d)
  const len = jalaliMonthLength(jy, jm)
  const [fy, fm, fd] = jalaliToGregorian(jy, jm, 1)
  const [ty, tm, td] = jalaliToGregorian(jy, jm, len)
  return { from: formatIsoDate(fy, fm, fd), to: formatIsoDate(ty, tm, td) }
}

/** @deprecated use jalaliMonthRangeLocal — kept for older imports */
export function monthRangeTehran(now = new Date()) {
  return jalaliMonthRangeLocal(now)
}

/**
 * Parse date-only or datetime into local calendar Y-M-D (+ optional time).
 * @param {string | number | Date | null | undefined} value
 */
function partsFromValue(value) {
  if (value == null || value === '') return null
  if (value instanceof Date && !Number.isNaN(value.getTime())) {
    return {
      y: value.getFullYear(),
      m: value.getMonth() + 1,
      d: value.getDate(),
      hour: value.getHours(),
      minute: value.getMinutes(),
      hasTime: true,
    }
  }
  const raw = String(value).trim()
  const isoDay = parseIsoDate(raw)
  if (isoDay && /^\d{4}-\d{2}-\d{2}$/.test(raw)) {
    return { y: isoDay.y, m: isoDay.m, d: isoDay.d, hour: 0, minute: 0, hasTime: false }
  }
  // datetime with timezone or local
  const dt = new Date(raw)
  if (Number.isNaN(dt.getTime())) return null
  return {
    y: dt.getFullYear(),
    m: dt.getMonth() + 1,
    d: dt.getDate(),
    hour: dt.getHours(),
    minute: dt.getMinutes(),
    hasTime: /T|\d{2}:\d{2}/.test(raw),
  }
}

/**
 * Display a calendar date in Jalali (never Gregorian digits like 2026-10-22).
 * @param {string | number | Date | null | undefined} value
 */
export function formatJalaliDate(value) {
  const p = partsFromValue(value)
  if (!p) return '—'
  const [jy, jm, jd] = gregorianToJalali(p.y, p.m, p.d)
  return toFaDigits(`${jd} ${JALALI_MONTHS[jm - 1]} ${jy}`)
}

/**
 * @param {string | number | Date | null | undefined} value
 */
export function formatDateTime(value) {
  const p = partsFromValue(value)
  if (!p) return '—'
  const datePart = formatJalaliDate(new Date(p.y, p.m - 1, p.d))
  if (!p.hasTime) return datePart
  const timePart = toFaDigits(
    `${String(p.hour).padStart(2, '0')}:${String(p.minute).padStart(2, '0')}`,
  )
  return `${datePart}، ساعت ${timePart}`
}

/**
 * @param {string | null | undefined} iso
 */
export function formatDateTimeShort(iso) {
  return formatDateTime(iso)
}

/**
 * Topbar chip: «امروز پنجشنبه ۱ آبان ۱۴۰۵»
 * @param {Date} [now]
 */
export function formatTodayChip(now = new Date()) {
  const { y, m, d } = localYmd(now)
  const [jy, jm, jd] = gregorianToJalali(y, m, d)
  // JS: 0=Sun … 6=Sat → Jalali week index Sat=0
  const weekday = JALALI_WEEKDAY_NAMES[(now.getDay() + 1) % 7]
  return toFaDigits(`امروز ${weekday} ${jd} ${JALALI_MONTHS[jm - 1]} ${jy}`)
}

/** Fill `[data-today-date]` elements in the document. */
export function mountTodayDate(root = document) {
  const text = formatTodayChip()
  root.querySelectorAll('[data-today-date]').forEach((el) => {
    el.textContent = text
    if (el instanceof HTMLTimeElement) {
      el.dateTime = isoDateLocal()
    }
  })
}

/** @param {string | null | undefined} t */
export function toTimeInput(t) {
  if (!t) return ''
  return String(t).slice(0, 5)
}

export const ROLE_LABEL = {
  manager: 'مدیر',
  receptionist: 'منشی',
  trainer: 'مربی',
  athlete: 'ورزشکار',
}

export const MEMBER_STATUS = {
  pending: 'در انتظار',
  active: 'فعال',
  archived: 'آرشیو',
}

export const PAYMENT_METHOD_LABEL = {
  cash: 'نقد',
  card: 'کارت',
  pos: 'کارت‌خوان',
  transfer: 'انتقال',
  online: 'آنلاین',
}

/** Display-only class gender tag (API: men | women | mixed). */
export const GENDER_LABEL = {
  mixed: 'مختلط',
  women: 'بانوان',
  men: 'آقایان',
}

/** @param {string | null | undefined} value */
export function genderLabelFa(value) {
  if (!value) return '—'
  return GENDER_LABEL[value] ?? value
}

/** @param {boolean} [gatewayEnabled] */
export function onlineMethodLabel(gatewayEnabled) {
  return gatewayEnabled ? 'آنلاین (درگاه)' : 'آنلاین (بدون درگاه)'
}

export const ATTENDANCE_TYPE_LABEL = {
  gym: 'سالن',
  class: 'کلاس',
  pt: 'جلسه مربی',
}
