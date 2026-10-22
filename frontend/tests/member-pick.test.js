import { describe, expect, it } from 'vitest'

import { memberPickLabel, renderMemberPick } from '../assets/js/ui.js'

describe('member pick helpers', () => {
  it('builds display name from member fields', () => {
    expect(
      memberPickLabel({
        first_name: 'علی',
        last_name: 'رضایی',
        display_id: 'M-1001',
      }),
    ).toBe('علی رضایی')
  })

  it('falls back to label when names missing', () => {
    expect(memberPickLabel({ label: 'فقط برچسب' })).toBe('فقط برچسب')
  })

  it('shows locker can/cannot badges only when opted in', () => {
    const root = document.createElement('div')
    const items = [
      {
        id: 1,
        first_name: 'سارا',
        last_name: 'محمدی',
        display_id: 'M-1002',
        mobile: '09121111002',
        has_active_membership: true,
        can_receive_locker: true,
      },
      {
        id: 2,
        first_name: 'علی',
        last_name: 'رضایی',
        display_id: 'M-1001',
        mobile: '09121111001',
        has_active_membership: true,
        can_receive_locker: false,
      },
    ]
    renderMemberPick(root, items, () => {}, { showLockerEligibility: true })
    const text = root.textContent || ''
    expect(text).toContain('می‌تواند کمد بگیرد')
    expect(text).toContain('نمی‌تواند کمد بگیرد')

    renderMemberPick(root, items, () => {})
    expect(root.textContent || '').not.toContain('کمد بگیرد')
  })
})
