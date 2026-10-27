import { describe, expect, it } from 'vitest'

import {
  createListPager,
  findItemPage,
  LIST_PAGE_SIZE,
  pageForIndex,
  slicePage,
} from '../assets/js/pagination.js'

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

  it('pageForIndex / findItemPage locate the page of a row (BUG-008)', () => {
    expect(pageForIndex(0)).toBe(1)
    expect(pageForIndex(4)).toBe(1)
    expect(pageForIndex(5)).toBe(2)
    expect(pageForIndex(11)).toBe(3)
    const items = Array.from({ length: 12 }, (_, i) => ({ id: i + 1 }))
    expect(findItemPage(items, (x) => x.id === 12)).toBe(3)
    expect(findItemPage(items, (x) => x.id === 99)).toBeNull()
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

  it('goToMatching jumps to the page that contains the item', () => {
    document.body.innerHTML = `<div data-pager></div><ul data-out></ul>`
    const pagerEl = document.querySelector('[data-pager]')
    const out = document.querySelector('[data-out]')
    const pager = createListPager(pagerEl)
    const all = [
      { id: 1, title: 'a' },
      { id: 2, title: 'b' },
      { id: 3, title: 'c' },
      { id: 4, title: 'd' },
      { id: 5, title: 'e' },
      { id: 6, title: 'جدید' },
    ]

    pager.paint(all, (rows) => {
      out.textContent = rows.map((r) => r.title).join(',')
    })
    expect(out.textContent).toBe('a,b,c,d,e')

    const page = pager.goToMatching(all, (rows) => {
      out.textContent = rows.map((r) => r.title).join(',')
    }, (row) => row.id === 6)
    expect(page).toBe(2)
    expect(pager.page).toBe(2)
    expect(out.textContent).toBe('جدید')
  })
})
