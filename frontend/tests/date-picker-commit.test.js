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

  it('datetime-local: picking a day keeps pop open and commits on confirm (BUG-006)', () => {
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

    picker.querySelector('.date-picker-trigger')?.click()
    expect(picker?.classList.contains('is-open')).toBe(true)

    const day20 = [...picker.querySelectorAll('.date-picker-day:not(.is-blank)')].find(
      (btn) => btn.dataset.day === '20',
    )
    expect(day20).toBeTruthy()
    day20.click()

    // Must stay open; day click must not reset via fake outside-click.
    expect(picker?.classList.contains('is-open')).toBe(true)
    const selected = picker.querySelector('.date-picker-day.is-selected')
    expect(selected?.dataset.day).toBe('20')
    // Value commits only on تأیید for datetime-local.
    expect(input.value).toBe('')

    const ok = picker.querySelector('.date-picker-actions .btn:not(.ghost)')
    expect(ok?.textContent).toContain('تأیید')
    ok?.click()

    expect(picker?.classList.contains('is-open')).toBe(false)
    expect(input.value).toMatch(/^2026-11-11T\d{2}:\d{2}$/)
  })

  it('blocks confirm when ends_at is not after starts_at (data-min-datetime-from)', () => {
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

    // Pick day 1 of current view month with default time — force pending before start via value override path:
    // set state by committing a too-early day: use todayParts month; instead click تأیید after
    // manually setting hidden value won't affect pending state. Pick an early day then confirm.
    const day1 = [...(picker?.querySelectorAll('.date-picker-day:not(.is-blank)') || [])].find(
      (btn) => btn.dataset.day === '1',
    )
    expect(day1).toBeTruthy()
    day1?.click()

    const ok = picker?.querySelector('.date-picker-actions .btn:not(.ghost)')
    ok?.click()

    // Still open with error; ends_at not committed.
    expect(picker?.classList.contains('is-open')).toBe(true)
    expect(picker?.querySelector('.date-picker-error')?.hidden).toBe(false)
    expect(picker?.querySelector('.date-picker-error')?.textContent).toContain('پایان')
    expect(ends.value).toBe('')
  })
})
