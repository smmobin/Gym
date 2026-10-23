import { describe, expect, it } from 'vitest'

import {
  displayJalali,
  formatIsoDate,
  gregorianToJalali,
  jalaliToGregorian,
  parseDateTimeLocal,
  saturdayIndex,
} from '../assets/js/jalali-utils.js'

describe('jalali utils', () => {
  it('round-trips known Nowruz 1403', () => {
    // 1403-01-01 = 2024-03-20
    expect(jalaliToGregorian(1403, 1, 1)).toEqual([2024, 3, 20])
    expect(gregorianToJalali(2024, 3, 20)).toEqual([1403, 1, 1])
  })

  it('formats display and ISO helpers', () => {
    expect(formatIsoDate(2024, 3, 20)).toBe('2024-03-20')
    expect(displayJalali(2024, 3, 20)).toContain('فروردین')
    expect(displayJalali(2024, 3, 20)).toContain('۱۴۰۳')
  })

  it('parses datetime-local and weekday index', () => {
    expect(parseDateTimeLocal('2024-03-20T18:30')).toEqual({
      y: 2024,
      m: 3,
      d: 20,
      hour: 18,
      minute: 30,
    })
    expect(saturdayIndex(2024, 3, 20)).toBeGreaterThanOrEqual(0)
    expect(saturdayIndex(2024, 3, 20)).toBeLessThanOrEqual(6)
  })

  it('maps Aban 1405 days used in finance reports', () => {
    // 1 / 19 / 20 / 21 آبان ۱۴۰۵
    expect(jalaliToGregorian(1405, 8, 1)).toEqual([2026, 10, 23])
    expect(jalaliToGregorian(1405, 8, 19)).toEqual([2026, 11, 10])
    expect(jalaliToGregorian(1405, 8, 20)).toEqual([2026, 11, 11])
    expect(jalaliToGregorian(1405, 8, 21)).toEqual([2026, 11, 12])
    expect(gregorianToJalali(2026, 11, 11)).toEqual([1405, 8, 20])
  })
})
