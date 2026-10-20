import { describe, expect, it } from 'vitest'

import {
  buildDeskActionPanelHtml,
  buildDeskStatsHtml,
} from '../assets/js/desk-dashboard.js'

describe('desk dashboard helpers', () => {
  it('renders today operational stats (happy path)', () => {
    const html = buildDeskStatsHtml({
      today_attendance_total: 12,
      today_open_count: 3,
      trial_open_count: 2,
      guests_today_count: 1,
    })
    expect(html).toContain('حاضر امروز')
    expect(html).toContain('باز بدون خروج')
    expect(html).toContain('صف آزمایشی باز')
    expect(html).toContain('مهمان امروز')
    expect(html).toContain('۱۲')
    expect(html).toContain('۳')
  })

  it('shows empty hint when action list is empty (edge)', () => {
    const html = buildDeskActionPanelHtml(
      'صف آزمایشی',
      'درخواست باز در صف نیست.',
      [],
      '#trial',
      'صف کامل',
    )
    expect(html).toContain('درخواست باز در صف نیست')
    expect(html).toContain('href="#trial"')
  })

  it('maps trial status tokens in action body', () => {
    const html = buildDeskActionPanelHtml(
      'صف آزمایشی',
      'خالی',
      [{ title: 'سارا', body: '0912 · new', href: '#trial' }],
      '#trial',
      'صف کامل',
    )
    expect(html).toContain('سارا')
    expect(html).toContain('جدید')
    expect(html).not.toContain('· new')
  })
})
