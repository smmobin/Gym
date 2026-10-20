import { describe, expect, it } from 'vitest'

import { memberPickLabel } from '../assets/js/ui.js'

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
})
