import { afterEach, describe, expect, it, vi } from 'vitest'

import { mountTestimonials } from '../assets/js/testimonials.js'

describe('mountTestimonials', () => {
  afterEach(() => {
    vi.unstubAllGlobals()
    document.body.innerHTML = ''
  })

  it('loads include_inactive list and paints author names', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn(async (url) => {
        const u = String(url)
        if (u.includes('/testimonials')) {
          return {
            ok: true,
            status: 200,
            json: async () => ({
              items: [
                {
                  id: 7,
                  body: 'متن نمونه',
                  author_name: 'علی رضایی',
                  author_meta: 'عضو سه‌ماهه',
                  sort_order: 10,
                  is_active: true,
                  created_at: '2026-01-01T00:00:00Z',
                },
              ],
              total: 1,
            }),
          }
        }
        return { ok: false, status: 404, json: async () => ({}) }
      }),
    )

    const root = document.createElement('div')
    document.body.appendChild(root)
    mountTestimonials(root, { role: 'manager' })
    await vi.waitFor(() => {
      expect(root.textContent).toContain('علی رضایی')
    })
    expect(root.querySelector('[data-create]')).toBeTruthy()
    expect(root.querySelector('[data-edit]')).toBeTruthy()
  })
})
