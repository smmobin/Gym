import { describe, expect, it } from 'vitest'

import { personSelectRowHtml, setPersonChip } from '../assets/js/members.js'

describe('person select row + chip', () => {
  it('builds search and chip on one shared row', () => {
    const html = personSelectRowHtml({
      label: 'جست‌وجوی عضو',
      emptyText: 'عضوی انتخاب نشده',
    })
    expect(html).toContain('class="person-select"')
    expect(html).toContain('person-select-search')
    expect(html).toContain('person-select-label')
    expect(html).toContain('data-person-chip')
    expect(html).toContain('عضوی انتخاب نشده')
    expect(html).toContain('aria-label="جست‌وجوی عضو"')
    expect(html).toContain('data-q')
    expect(html).toContain('data-pick')
    expect(html).not.toContain('<label>')
  })

  it('setPersonChip fills selected state with name and meta', () => {
    document.body.innerHTML = personSelectRowHtml()
    const chip = /** @type {HTMLElement} */ (document.querySelector('[data-selected]'))
    setPersonChip(chip, {
      first_name: 'سارا',
      last_name: 'محمدی',
      display_id: 'M-12',
      mobile: '09120000004',
    })
    expect(chip.classList.contains('is-selected')).toBe(true)
    expect(chip.classList.contains('is-empty')).toBe(false)
    expect(chip.querySelector('.person-chip-title')?.textContent).toContain('سارا')
    expect(chip.querySelector('.person-chip-meta')?.textContent).toContain('M-12')
    expect(chip.querySelector('.person-chip-meta')?.hidden).toBe(false)

    setPersonChip(chip, null)
    expect(chip.classList.contains('is-empty')).toBe(true)
    expect(chip.querySelector('.person-chip-title')?.textContent).toBe('عضوی انتخاب نشده')
  })
})
