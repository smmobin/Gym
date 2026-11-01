import { afterEach, describe, expect, it, vi } from 'vitest'

import {
  capacityBadgeHtml,
  mountPublicSchedule,
  renderPublicScheduleRows,
  scheduleCtaHtml,
} from '../assets/js/public-schedule.js'

describe('public landing schedule', () => {
  afterEach(() => {
    vi.unstubAllGlobals()
    document.body.innerHTML = ''
  })

  it('capacityBadgeHtml warns when two or fewer seats left', () => {
    expect(capacityBadgeHtml({ capacity: 10, remaining: 2, booked_count: 8 })).toContain('warn')
    expect(capacityBadgeHtml({ capacity: 10, remaining: 2, booked_count: 8 })).toContain('۲')
    expect(capacityBadgeHtml({ capacity: 12, remaining: 8, booked_count: 4 })).toContain('ok')
    expect(capacityBadgeHtml({ capacity: 10, remaining: 0, booked_count: 10 })).toContain('danger')
    expect(capacityBadgeHtml({ capacity: 10, remaining: 0, booked_count: 10 })).toContain('تکمیل')
  })

  it('scheduleCtaHtml links to login when seats remain', () => {
    const html = scheduleCtaHtml({ capacity: 5, remaining: 1, booked_count: 4 })
    expect(html).toContain('/login/')
    expect(html).toContain('ورود برای رزرو')
    expect(scheduleCtaHtml({ capacity: 5, remaining: 0, booked_count: 5 })).toContain('disabled')
  })

  it('mountPublicSchedule renders titles from mock fetch', async () => {
    const tbody = document.createElement('tbody')
    document.body.appendChild(tbody)
    await mountPublicSchedule(tbody, null, {
      fetchClasses: async () => ({
        items: [
          {
            id: 1,
            title: 'یوگا بانوان',
            trainer_full_name: 'مربی یک',
            capacity: 10,
            booked_count: 1,
            remaining: 9,
            starts_at: '2030-06-15T15:30:00+00:00',
            ends_at: '2030-06-15T16:30:00+00:00',
            gender_label: 'women',
          },
          {
            id: 2,
            title: 'اسپینینگ عصر',
            trainer_full_name: 'مربی دو',
            capacity: 3,
            booked_count: 3,
            remaining: 0,
            starts_at: '2030-06-16T18:00:00+00:00',
            ends_at: '2030-06-16T19:00:00+00:00',
            gender_label: 'men',
          },
        ],
      }),
    })
    expect(tbody.textContent).toContain('یوگا بانوان')
    expect(tbody.textContent).toContain('اسپینینگ عصر')
    expect(tbody.textContent).toContain('مربی یک')
    expect(tbody.querySelector('[data-class-id="1"] a')?.getAttribute('href')).toBe('/login/')
    expect(tbody.querySelector('[data-class-id="2"] button')?.disabled).toBe(true)
    expect(tbody.innerHTML).not.toContain('فانکشنال')
    expect(tbody.innerHTML).not.toContain('رزرو نمایشی')
  })

  it('mountPublicSchedule shows Persian error when API fails', async () => {
    const tbody = document.createElement('tbody')
    const status = document.createElement('p')
    document.body.appendChild(tbody)
    document.body.appendChild(status)
    await mountPublicSchedule(tbody, status, {
      fetchClasses: async () => {
        throw new Error('network down')
      },
    })
    expect(status.hidden).toBe(false)
    expect(status.textContent).toMatch(/میز پذیرش|در دسترس/)
    expect(tbody.querySelector('[data-class-id]')).toBeNull()
  })

  it('renderPublicScheduleRows empty state has no fake demo titles', () => {
    const html = renderPublicScheduleRows([])
    expect(html).toContain('میز پذیرش')
    expect(html).not.toContain('فانکشنال')
    expect(html).not.toContain('رزرو نمایشی')
  })
})
