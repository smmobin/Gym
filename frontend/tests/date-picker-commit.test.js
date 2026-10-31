import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

/**
 * Load the IIFE date-picker into jsdom and verify FormData gets the Jalali-picked day.
 */
describe('GymDatePicker FormData commit', () => {
  beforeEach(async () => {
    document.body.innerHTML = ''
    vi.resetModules()
    // Ensure a clean global
    // @ts-expect-error test cleanup
    delete window.GymDatePicker
    await import('../public/js/date-picker.js')
  })

  afterEach(() => {
    document.body.innerHTML = ''
  })

  it('writes ISO value into FormData after picking a Jalali day', () => {
    document.body.innerHTML = `
      <form id="f">
        <input type="date" name="expense_date" value="2026-10-23" />
        <button type="submit">go</button>
      </form>
    `
    window.GymDatePicker.refresh(document)
    const input = document.querySelector('[name=expense_date]')
    expect(input).toBeTruthy()
    expect(input.type).toBe('hidden')

    const picker = input.closest('[data-date-picker]')
    expect(picker).toBeTruthy()
    expect(picker?.textContent).not.toContain('انصراف')
    expect(picker?.textContent).not.toContain('تأیید')

    // Open and pick day 20 of current Jalali month (Aban 1405 → 2026-11-11)
    picker.querySelector('.date-picker-trigger').click()
    const day20 = [...picker.querySelectorAll('.date-picker-day:not(.is-blank)')].find(
      (btn) => btn.dataset.day === '20',
    )
    expect(day20).toBeTruthy()
    day20.click()

    expect(input.value).toBe('2026-11-11')
    expect(picker?.classList.contains('is-open')).toBe(false)

    const form = document.getElementById('f')
    window.GymDatePicker.flush(form)
    const fd = new FormData(form)
    expect(fd.get('expense_date')).toBe('2026-11-11')
  })

  it('datetime-local: day click applies and closes the panel', () => {
    document.body.innerHTML = `
      <form id="f">
        <input type="datetime-local" name="starts_at" />
      </form>
    `
    window.GymDatePicker.refresh(document)
    const input = /** @type {HTMLInputElement} */ (document.querySelector('[name=starts_at]'))
    expect(input.type).toBe('hidden')

    const picker = input.closest('[data-date-picker]')
    expect(picker).toBeTruthy()
    expect(picker?.classList.contains('has-time')).toBe(true)
    expect(picker?.textContent).not.toContain('انصراف')
    expect(picker?.textContent).not.toContain('تأیید')

    picker.querySelector('.date-picker-trigger')?.click()
    expect(picker?.classList.contains('is-open')).toBe(true)

    const day20 = [...picker.querySelectorAll('.date-picker-day:not(.is-blank)')].find(
      (btn) => btn.dataset.day === '20',
    )
    expect(day20).toBeTruthy()
    day20.click()

    expect(input.value).toMatch(/^2026-11-11T\d{2}:\d{2}$/)
    expect(picker?.classList.contains('is-open')).toBe(false)
  })

  it('opens month and year lists from the nav title', () => {
    document.body.innerHTML = `
      <form id="f">
        <input type="date" name="expense_date" value="2026-10-23" />
      </form>
    `
    window.GymDatePicker.refresh(document)
    const picker = document.querySelector('[data-date-picker]')
    expect(picker).toBeTruthy()
    picker?.querySelector('.date-picker-trigger')?.click()

    const monthBtn = picker?.querySelector('.date-picker-nav-month')
    const yearBtn = picker?.querySelector('.date-picker-nav-year')
    expect(monthBtn?.textContent).toContain('آبان')
    expect(yearBtn?.textContent).toMatch(/۱۴۰۵/)

    monthBtn?.click()
    expect(picker?.querySelector('.date-picker-months')?.hidden).toBe(false)
    expect(picker?.querySelector('.date-picker-grid')?.hidden).toBe(true)
    const farvardin = [...(picker?.querySelectorAll('.date-picker-month') || [])].find(
      (btn) => btn.dataset.month === '1',
    )
    farvardin?.click()
    expect(picker?.querySelector('.date-picker-grid')?.hidden).toBe(false)
    expect(picker?.querySelector('.date-picker-nav-month')?.textContent).toBe('فروردین')

    yearBtn?.click()
    expect(picker?.querySelector('.date-picker-years')?.hidden).toBe(false)
    const y1404 = [...(picker?.querySelectorAll('.date-picker-year') || [])].find(
      (btn) => btn.dataset.year === '1404',
    )
    expect(y1404).toBeTruthy()
    y1404?.click()
    expect(picker?.querySelector('.date-picker-months')?.hidden).toBe(false)
    expect(picker?.querySelector('.date-picker-nav-year')?.textContent).toMatch(/۱۴۰۴/)
  })

  it('blocks day apply when ends_at is not after starts_at (data-min-datetime-from)', () => {
    document.body.innerHTML = `
      <form id="f">
        <input type="datetime-local" name="starts_at" value="2030-06-02T10:00" />
        <input type="datetime-local" name="ends_at" data-min-datetime-from="starts_at" />
      </form>
    `
    window.GymDatePicker.refresh(document)
    const ends = /** @type {HTMLInputElement} */ (document.querySelector('[name=ends_at]'))
    const picker = ends.closest('[data-date-picker]')
    expect(picker).toBeTruthy()

    picker?.querySelector('.date-picker-trigger')?.click()
    expect(picker?.classList.contains('is-open')).toBe(true)

    const day1 = [...(picker?.querySelectorAll('.date-picker-day:not(.is-blank)') || [])].find(
      (btn) => btn.dataset.day === '1',
    )
    expect(day1).toBeTruthy()
    day1?.click()

    // Invalid range: show error, do not commit, stay open (no تأیید button).
    expect(picker?.classList.contains('is-open')).toBe(true)
    expect(picker?.querySelector('.date-picker-error')?.hidden).toBe(false)
    expect(picker?.querySelector('.date-picker-error')?.textContent).toContain('پایان')
    expect(ends.value).toBe('')
  })
})
