/** @param {number} n */
export function formatToman(n) {
  return `${Number(n || 0).toLocaleString('fa-IR')} تومان`
}

/** @param {string | number | Date | null | undefined} value */
export function formatDateTime(value) {
  if (!value) return '—'
  try {
    return new Date(value).toLocaleString('fa-IR')
  } catch {
    return String(value)
  }
}

/** @param {string | null | undefined} iso */
export function formatDateTimeShort(iso) {
  if (!iso) return '—'
  try {
    return new Date(iso).toLocaleString('fa-IR', {
      dateStyle: 'short',
      timeStyle: 'short',
    })
  } catch {
    return iso
  }
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
}

export const MEMBER_STATUS = {
  pending: 'در انتظار',
  active: 'فعال',
  archived: 'آرشیو',
}

export const PAYMENT_METHOD_LABEL = {
  cash: 'نقد',
  card: 'کارت',
  transfer: 'انتقال',
  online: 'آنلاین (بدون درگاه)',
}

export const ATTENDANCE_TYPE_LABEL = {
  gym: 'سالن',
  class: 'کلاس',
  pt: 'جلسه مربی',
}
