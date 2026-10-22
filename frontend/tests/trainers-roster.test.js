import { afterEach, describe, expect, it, vi } from 'vitest'

import { mountTrainers, trainerRosterHtml } from '../assets/js/trainers.js'

describe('trainer roster', () => {
  afterEach(() => {
    vi.unstubAllGlobals()
    document.body.innerHTML = ''
  })

  it('trainerRosterHtml lists athlete names', () => {
    const html = trainerRosterHtml([
      {
        id: 1,
        member_id: 10,
        member_display_id: 'M-1001',
        member_first_name: 'علی',
        member_last_name: 'رضایی',
        member_mobile: '09120000011',
      },
    ])
    expect(html).toContain('علی')
    expect(html).toContain('M-1001')
    expect(html).toContain('data-roster-end="1"')
  })

  it('mountTrainers loads roster when trainer select changes', async () => {
    const fetchMock = vi.fn(async (url) => {
      const path = String(url)
      if (path.includes('/api/v1/trainers/') && path.includes('/members')) {
        return {
          ok: true,
          status: 200,
          json: async () => ({
            trainer_user_id: 3,
            trainer_full_name: 'رضا',
            items: [
              {
                id: 7,
                member_id: 1,
                member_display_id: 'M-1001',
                member_first_name: 'علی',
                member_last_name: 'نوری',
                member_mobile: '09120000011',
                is_active: true,
              },
            ],
            total: 1,
          }),
        }
      }
      if (path.endsWith('/api/v1/trainers') || path.includes('/api/v1/trainers?')) {
        return {
          ok: true,
          status: 200,
          json: async () => ({
            items: [
              { id: 3, full_name: 'رضا', mobile: '09131570847', is_active: true },
              { id: 4, full_name: 'محسن', mobile: '09131570845', is_active: true },
            ],
            total: 2,
          }),
        }
      }
      return { ok: true, status: 200, json: async () => ({ items: [], total: 0 }) }
    })
    vi.stubGlobal('fetch', fetchMock)

    const root = document.createElement('div')
    document.body.appendChild(root)
    mountTrainers(root, { role: 'manager' })

    await vi.waitFor(() => {
      expect(root.querySelector('[data-trainer-roster]')?.textContent).toContain('علی')
    })
    expect(root.textContent).toContain('شاگردان رضا')
    expect(fetchMock.mock.calls.some((c) => String(c[0]).includes('/trainers/3/members'))).toBe(true)

    const sel = /** @type {HTMLSelectElement} */ (root.querySelector('[data-trainers]'))
    sel.value = '4'
    sel.dispatchEvent(new Event('change', { bubbles: true }))

    await vi.waitFor(() => {
      expect(fetchMock.mock.calls.some((c) => String(c[0]).includes('/trainers/4/members'))).toBe(true)
    })
  })
})
