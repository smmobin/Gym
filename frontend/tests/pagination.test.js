import { describe, expect, it } from 'vitest'

import { createListPager, LIST_PAGE_SIZE, slicePage } from '../assets/js/pagination.js'

describe('list pagination', () => {
  it('uses page size 5', () => {
    expect(LIST_PAGE_SIZE).toBe(5)
  })

  it('slices pages correctly', () => {
    const items = [1, 2, 3, 4, 5, 6, 7]
    const p1 = slicePage(items, 1)
    expect(p1.items).toEqual([1, 2, 3, 4, 5])
    expect(p1.totalPages).toBe(2)
    const p2 = slicePage(items, 2)
    expect(p2.items).toEqual([6, 7])
    expect(p2.page).toBe(2)
  })

  it('clamps out-of-range page', () => {
    const items = [1, 2, 3]
    expect(slicePage(items, 99).page).toBe(1)
    expect(slicePage(items, 0).page).toBe(1)
  })

  it('createListPager paints and navigates', () => {
    document.body.innerHTML = `<div data-pager></div><ul data-out></ul>`
    const pagerEl = document.querySelector('[data-pager]')
    const out = document.querySelector('[data-out]')
    const pager = createListPager(pagerEl)
    const all = [1, 2, 3, 4, 5, 6]

    pager.paint(all, (rows) => {
      out.textContent = rows.join(',')
    })
    expect(out.textContent).toBe('1,2,3,4,5')
    expect(pagerEl?.hidden).toBe(false)
    expect(pagerEl?.textContent).toMatch(/صفحه/)

    pagerEl.querySelector('[data-pager="next"]')?.dispatchEvent(new MouseEvent('click', { bubbles: true }))
    expect(out.textContent).toBe('6')
  })
})
