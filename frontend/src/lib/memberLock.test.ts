import { describe, expect, it } from 'vitest'

import { ApiError } from '@/lib/api'
import { formatMemberLockConflict, lockErrorMessage } from '@/lib/memberLock'

describe('memberLock helpers', () => {
  it('formats 409 lock conflict with holder name', () => {
    const text = formatMemberLockConflict({
      code: 'member_file_locked',
      message: 'پرونده قفل است.',
      locked_by_name: 'منشی نمونه',
      locked_by_mobile: '09120000002',
      expires_at: '2026-10-19T12:00:00+00:00',
    })
    expect(text).toContain('پرونده قفل است')
    expect(text).toMatch(/انقضا/)
  })

  it('returns null for unrelated detail', () => {
    expect(formatMemberLockConflict('ورود دوم')).toBeNull()
    expect(formatMemberLockConflict({ code: 'other' })).toBeNull()
  })

  it('lockErrorMessage prefers formatted conflict', () => {
    const err = new ApiError(409, 'fallback', {
      code: 'member_file_locked',
      message: 'قفل دست دیگری است.',
      locked_by_name: 'مدیر',
    })
    expect(lockErrorMessage(err, 'خطا')).toContain('قفل دست دیگری')
  })
})
