import { describe, expect, it } from 'vitest'

import {
  formatJalaliDate,
  formatTodayChip,
  jalaliMonthRangeLocal,
  todayRangeLocal,
} from '../assets/js/format.js'

describe('Jalali display helpers', () => {
  it('formats ISO dates as Jalali Persian text (never raw 2026-10-22)', () => {
    expect(formatJalaliDate('2026-10-23')).toBe('۱ آبان ۱۴۰۵')
    expect(formatJalaliDate('2026-11-13')).toBe('۲۲ آبان ۱۴۰۵')
    expect(formatJalaliDate('')).toBe('—')
  })

  it('defaults report range to today→today', () => {
    const range = todayRangeLocal(new Date(2026, 9, 23))
    expect(range).toEqual({ from: '2026-10-23', to: '2026-10-23' })
  })

  it('uses current Jalali month for dashboard month range', () => {
    const range = jalaliMonthRangeLocal(new Date(2026, 9, 23))
    expect(range).toEqual({ from: '2026-10-23', to: '2026-11-21' })
  })

  it('builds today chip with weekday', () => {
    // 2026-10-23 is Friday locally
    const chip = formatTodayChip(new Date(2026, 9, 23))
    expect(chip).toContain('امروز')
    expect(chip).toContain('آبان')
    expect(chip).toContain('۱۴۰۵')
    expect(chip).toMatch(/جمعه|پنجشنبه|چهارشنبه|سه‌شنبه|دوشنبه|یکشنبه|شنبه/)
  })
})
