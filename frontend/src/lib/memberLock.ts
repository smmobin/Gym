import { ApiError } from '@/lib/api'
import type { MemberLockConflict } from '@/types/memberLocks'

export function formatMemberLockConflict(detail: unknown): string | null {
  if (!detail || typeof detail !== 'object' || Array.isArray(detail)) {
    return null
  }
  const d = detail as MemberLockConflict
  if (d.code !== 'member_file_locked' && !d.locked_by_name && !d.expires_at) {
    if (typeof d.message === 'string' && d.message.includes('پرونده')) {
      return d.message
    }
    return null
  }
  const name = d.locked_by_name ?? 'کاربر دیگر'
  const mobile = d.locked_by_mobile ? ` (${d.locked_by_mobile})` : ''
  let expires = ''
  if (d.expires_at) {
    try {
      const dt = new Date(d.expires_at)
      expires = ` — انقضا: ${dt.toLocaleString('fa-IR')}`
    } catch {
      expires = ` — انقضا: ${d.expires_at}`
    }
  }
  if (typeof d.message === 'string' && d.message.trim()) {
    return `${d.message}${expires && !d.message.includes('انقضا') ? expires : ''}`
  }
  return `پرونده الان در اختیار ${name}${mobile} است${expires}.`
}

export function lockErrorMessage(err: unknown, fallback: string): string {
  if (err instanceof ApiError) {
    const fromDetail = formatMemberLockConflict(err.detail)
    if (fromDetail) return fromDetail
    return err.message
  }
  return fallback
}
