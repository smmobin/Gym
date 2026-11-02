import { afterEach, describe, expect, it, vi } from 'vitest'

import {
  TESTIMONIALS_PAGE_SIZE,
  formatCite,
  formatQuoteBody,
  mountPublicTestimonials,
  paintTestimonialsPage,
  renderPublicTestimonialCards,
  renderTestimonialsPager,
} from '../assets/js/public-testimonials.js'

/** @param {number} n */
function fakeItems(n) {
  return Array.from({ length: n }, (_, i) => ({
    id: i + 1,
    body: `متن ${i + 1}`,
    author_name: `عضو ${i + 1}`,
    author_meta: 'عضو ماهانه',
    sort_order: (i + 1) * 10,
  }))
}

describe('public landing testimonials', () => {
  afterEach(() => {
    vi.unstubAllGlobals()
    document.body.innerHTML = ''
  })

  it('uses page size three', () => {
    expect(TESTIMONIALS_PAGE_SIZE).toBe(3)
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

  it('renderTestimonialsPager hidden when three or fewer', () => {
    expect(renderTestimonialsPager({ page: 1, totalPages: 1, total: 3 })).toBe('')
  })

  it('renderTestimonialsPager shows next label for desktop paging', () => {
    const html = renderTestimonialsPager({ page: 1, totalPages: 2, total: 4 })
    expect(html).toContain('۳ نظر بعدی')
    expect(html).toContain('data-testimonials-next')
    expect(html).toContain('data-testimonials-prev')
  })

  it('paintTestimonialsPage shows only three cards then next page', () => {
    const grid = document.createElement('div')
    const pager = document.createElement('div')
    document.body.appendChild(grid)
    document.body.appendChild(pager)
    /** @type {number} */
    let page = 1
    const items = fakeItems(4)
    const paint = () =>
      paintTestimonialsPage(grid, pager, items, page, (next) => {
        page = next
        paint()
      })
    paint()
    expect(grid.querySelectorAll('blockquote')).toHaveLength(3)
    expect(grid.textContent).toContain('متن 1')
    expect(grid.textContent).not.toContain('متن 4')
    expect(pager.hidden).toBe(false)
    const nextBtn = pager.querySelector('[data-testimonials-next]')
    expect(nextBtn).toBeTruthy()
    nextBtn.click()
    expect(page).toBe(2)
    expect(grid.querySelectorAll('blockquote')).toHaveLength(1)
    expect(grid.textContent).toContain('متن 4')
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

  it('mountPublicTestimonials paginates four items', async () => {
    const section = document.createElement('section')
    const grid = document.createElement('div')
    const pagerHost = document.createElement('div')
    pagerHost.setAttribute('data-testimonials-pager-host', '')
    section.appendChild(grid)
    section.appendChild(pagerHost)
    document.body.appendChild(section)
    await mountPublicTestimonials(grid, null, {
      fetchTestimonials: async () => ({ items: fakeItems(4) }),
      pagerHost,
    })
    expect(grid.querySelectorAll('blockquote')).toHaveLength(3)
    expect(pagerHost.hidden).toBe(false)
    expect(pagerHost.textContent).toContain('۳ نظر بعدی')
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
