import { describe, expect, it } from 'vitest'

import { displayTime, formatTime, parseTime, toFaDigits } from '../assets/js/time-picker-utils.js'

describe('time picker utils', () => {
  it('parses HH:MM and clamps ranges', () => {
    expect(parseTime('23:45')).toEqual({ hour: 23, minute: 45 })
    expect(parseTime('9:05')).toEqual({ hour: 9, minute: 5 })
    expect(parseTime('')).toEqual({ hour: 0, minute: 0 })
    expect(parseTime('99:99')).toEqual({ hour: 23, minute: 59 })
  })

  it('formats and displays Persian digits', () => {
    expect(formatTime(7, 0)).toBe('07:00')
    expect(displayTime(23, 45)).toBe('۲۳:۴۵')
    expect(toFaDigits('12')).toBe('۱۲')
  })
})
