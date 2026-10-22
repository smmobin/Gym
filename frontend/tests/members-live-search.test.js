import { afterEach, describe, expect, it, vi } from 'vitest'

import { mountMembers } from '../assets/js/members.js'

describe('mountMembers live search / no manual buttons', () => {
  afterEach(() => {
    vi.useRealTimers()
    vi.unstubAllGlobals()
    document.body.innerHTML = ''
  })

  it('has no جستجو/بازخوانی buttons and searches while typing', async () => {
    vi.useFakeTimers({ shouldAdvanceTime: true })
    const fetchMock = vi.fn(async (url) => {
      const u = String(url)
      const q = new URL(u, 'http://local').searchParams.get('q')
      const items =
        q === 'مه'
          ? [
              {
                id: 1,
                display_id: 'M-1',
                first_name: 'مهدی',
                last_name: 'تست',
                mobile: '09120000001',
                status: 'active',
              },
            ]
          : []
      return {
        ok: true,
        status: 200,
        json: async () => ({ items, total: items.length }),
      }
    })
    vi.stubGlobal('fetch', fetchMock)

    const root = document.createElement('div')
    const section = document.createElement('div')
    section.setAttribute('data-section', 'members')
    section.appendChild(root)
    document.body.appendChild(section)

    mountMembers(root, { role: 'manager' })
    expect(root.querySelector('[data-search]')).toBeNull()
    expect(root.querySelector('[data-reload]')).toBeNull()
    expect(root.textContent).not.toContain('بازخوانی')

    await vi.waitFor(() => expect(fetchMock).toHaveBeenCalled())

    const input = /** @type {HTMLInputElement} */ (root.querySelector('[data-q]'))
    input.value = 'مه'
    input.dispatchEvent(new Event('input', { bubbles: true }))
    await vi.advanceTimersByTimeAsync(300)

    await vi.waitFor(() => {
      expect(root.querySelector('[data-tbody]')?.textContent).toContain('مهدی')
    })
    expect(fetchMock.mock.calls.some((c) => String(c[0]).includes('q=%D9%85%D9%87') || String(c[0]).includes('q=مه'))).toBe(
      true,
    )
    vi.clearAllTimers()
  })
})
