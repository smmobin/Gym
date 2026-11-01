import { afterEach, describe, expect, it, vi } from 'vitest'

import {
  formatCite,
  formatQuoteBody,
  mountPublicTestimonials,
  renderPublicTestimonialCards,
} from '../assets/js/public-testimonials.js'

describe('public landing testimonials', () => {
  afterEach(() => {
    vi.unstubAllGlobals()
    document.body.innerHTML = ''
  })

  it('formatQuoteBody adds guillemets when missing', () => {
    expect(formatQuoteBody('سلام')).toBe('«سلام»')
    expect(formatQuoteBody('«از قبل»')).toBe('«از قبل»')
  })

  it('formatCite joins name and meta', () => {
    expect(formatCite({ author_name: 'علی', author_meta: 'عضو ماهانه' })).toBe(
      'علی · عضو ماهانه',
    )
    expect(formatCite({ author_name: 'سارا', author_meta: null })).toBe('سارا')
  })

  it('mountPublicTestimonials renders quotes from mock fetch', async () => {
    const grid = document.createElement('div')
    document.body.appendChild(grid)
    await mountPublicTestimonials(grid, null, {
      fetchTestimonials: async () => ({
        items: [
          {
            id: 1,
            body: 'سالن تمیز است.',
            author_name: 'رضا حسینی',
            author_meta: 'عضو شش‌ماهه',
            sort_order: 10,
          },
        ],
      }),
    })
    expect(grid.textContent).toContain('سالن تمیز است')
    expect(grid.textContent).toContain('رضا حسینی')
    expect(grid.querySelector('[data-testimonial-id="1"]')).toBeTruthy()
  })

  it('mountPublicTestimonials shows error when API fails', async () => {
    const grid = document.createElement('div')
    const status = document.createElement('p')
    document.body.appendChild(grid)
    document.body.appendChild(status)
    await mountPublicTestimonials(grid, status, {
      fetchTestimonials: async () => {
        throw new Error('network down')
      },
    })
    expect(status.hidden).toBe(false)
    expect(status.textContent).toMatch(/در دسترس|نظر/)
    expect(grid.querySelector('blockquote')).toBeNull()
  })

  it('renderPublicTestimonialCards empty state', () => {
    const html = renderPublicTestimonialCards([])
    expect(html).toContain('نظری برای نمایش نیست')
  })
})
