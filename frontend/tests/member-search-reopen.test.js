import { afterEach, describe, expect, it, vi } from 'vitest'

import { bindMemberSearch } from '../assets/js/members.js'

describe('bindMemberSearch reopen without outside click', () => {
  afterEach(() => {
    vi.unstubAllGlobals()
    document.body.innerHTML = ''
  })

  it('reopens the overlay when clicking the already-focused input after a pick', async () => {
    const member = {
      id: 1,
      first_name: 'علی',
      last_name: 'رضایی',
      display_id: 'M-1001',
      mobile: '09121111001',
      has_active_membership: true,
    }
    const fetchMock = vi.fn(async () => ({
      ok: true,
      status: 200,
      json: async () => ({ items: [member], total: 1 }),
    }))
    vi.stubGlobal('fetch', fetchMock)

    document.body.innerHTML = `
      <div>
        <label class="full">جست‌وجوی عضو<input type="search" data-q /></label>
        <div class="member-pick" data-pick></div>
      </div>
    `
    const input = /** @type {HTMLInputElement} */ (document.querySelector('[data-q]'))
    const pick = /** @type {HTMLElement} */ (document.querySelector('[data-pick]'))
    const onPick = vi.fn()
    bindMemberSearch(pick, input, onPick)

    input.focus()
    await vi.waitFor(() => {
      expect(pick.hidden).toBe(false)
      expect(pick.textContent).toContain('علی رضایی')
    })

    const item = /** @type {HTMLButtonElement} */ (pick.querySelector('.member-pick-item'))
    item.dispatchEvent(new MouseEvent('mousedown', { bubbles: true, cancelable: true }))
    item.click()
    expect(onPick).toHaveBeenCalled()
    expect(pick.hidden).toBe(true)
    expect(document.activeElement).toBe(input)

    // Still focused — focus will not fire again; click must reopen.
    input.dispatchEvent(new MouseEvent('click', { bubbles: true }))
    await vi.waitFor(() => {
      expect(pick.hidden).toBe(false)
      expect(pick.textContent).toContain('علی رضایی')
    })
  })
})
