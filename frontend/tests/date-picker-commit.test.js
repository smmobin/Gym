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

    // Open and pick day 20 of current Jalali month (Aban 1405 → 2026-11-11)
    picker.querySelector('.date-picker-trigger').click()
    const day20 = [...picker.querySelectorAll('.date-picker-day:not(.is-blank)')].find(
      (btn) => btn.dataset.day === '20',
    )
    expect(day20).toBeTruthy()
    day20.click()

    expect(input.value).toBe('2026-11-11')

    const form = document.getElementById('f')
    window.GymDatePicker.flush(form)
    const fd = new FormData(form)
    expect(fd.get('expense_date')).toBe('2026-11-11')
  })
})
