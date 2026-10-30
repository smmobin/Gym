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
        has_active_locker: false,
      },
      {
        id: 2,
        first_name: 'علی',
        last_name: 'رضایی',
        display_id: 'M-1001',
        mobile: '09121111001',
        has_active_membership: true,
        can_receive_locker: false,
        has_active_locker: false,
      },
    ]
    renderMemberPick(root, items, () => {}, { showLockerEligibility: true })
    const text = root.textContent || ''
    expect(text).toContain('می‌تواند کمد بگیرد')
    expect(text).toContain('نمی‌تواند کمد بگیرد')

    renderMemberPick(root, items, () => {})
    expect(root.textContent || '').not.toContain('کمد بگیرد')
  })

  it('marks members with an active locker and does not pick them', () => {
    const root = document.createElement('div')
    const picked = []
    const items = [
      {
        id: 10,
        first_name: 'سارا',
        last_name: 'محمدی',
        display_id: 'M-1002',
        mobile: '09121111002',
        has_active_membership: true,
        can_receive_locker: true,
        has_active_locker: true,
        current_locker_code: 'L-01',
      },
      {
        id: 11,
        first_name: 'مینا',
        last_name: 'کاظمی',
        display_id: 'M-1010',
        mobile: '09121111010',
        has_active_membership: true,
        can_receive_locker: true,
        has_active_locker: false,
      },
    ]
    renderMemberPick(root, items, (id) => picked.push(id), { showLockerEligibility: true })
    expect(root.textContent || '').toContain('کمد دارد (L-01)')
    expect(root.textContent || '').toContain('می‌تواند کمد بگیرد')

    const occupied = /** @type {HTMLButtonElement} */ (root.querySelectorAll('.member-pick-item')[0])
    const free = /** @type {HTMLButtonElement} */ (root.querySelectorAll('.member-pick-item')[1])
    expect(occupied.disabled).toBe(true)
    expect(occupied.classList.contains('is-disabled')).toBe(true)
    expect(occupied.title).toContain('آزاد')
    occupied.click()
    expect(picked).toEqual([])

    expect(free.disabled).toBe(false)
    free.click()
    expect(picked).toEqual([11])
  })
})
