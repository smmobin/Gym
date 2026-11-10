import { readFileSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'

import { afterEach, describe, expect, it, vi } from 'vitest'

import {
  buildActivityQuery,
  buildActivityRowsHtml,
  countActivity,
  defaultActivityRange,
  fallbackExportFilename,
  filenameFromDisposition,
  mountActivity,
} from '../assets/js/activity.js'
import { NAV_ICON_BY_HASH } from '../assets/js/nav-icons.js'

const root = join(dirname(fileURLToPath(import.meta.url)), '..')

const SAMPLE = [
  {
    id: 'a-1',
    source: 'audit',
    category: 'auth',
    action: 'auth.login.failure',
    outcome: 'fail',
    created_at: '2026-11-10T08:10:00+03:30',
    actor_name: null,
    actor_role: null,
    summary: 'ورود ناموفق (0912***9876) با رمز',
    request_id: '7f3c2a10-1111-2222-3333-444455556666',
  },
  {
    id: 'e-1',
    source: 'error',
    category: 'errors',
    action: 'server.http_500',
    outcome: 'fail',
    created_at: '2026-11-09T13:07:00+03:30',
    summary: 'خطای داخلی سرور (OperationalError)',
    request_id: 'seed-err-0001',
    method: 'GET',
    path: '/api/v1/reports/profit',
    status_code: 500,
  },
  {
    id: 'a-2',
    source: 'audit',
    category: 'plans',
    action: 'plan.update',
    outcome: 'ok',
    created_at: '2026-11-08T09:45:00+03:30',
    actor_name: 'مدیر نمونه',
    actor_role: 'manager',
    summary: 'تغییر قیمت طرح <b>ماهانه</b>',
    request_id: null,
  },
]

afterEach(() => {
  vi.unstubAllGlobals()
  document.body.innerHTML = ''
})

describe('activity helpers', () => {
  it('builds query with range, search, category and cursor', () => {
    const params = buildActivityQuery({
      from: '2026-11-04',
      to: '2026-11-10',
      q: '  تغییر قیمت ',
      category: 'plans',
      cursor: '2026-11-08T06:15:00+00:00',
    })
    expect(params.get('from')).toBe('2026-11-04')
    expect(params.get('q')).toBe('تغییر قیمت')
    expect(params.get('category')).toBe('plans')
    expect(params.toString()).toContain('cursor=2026-11-08T06%3A15%3A00%2B00%3A00')
  })

  it('omits empty filters', () => {
    expect(buildActivityQuery({ from: '2026-11-01', to: '2026-11-02', q: ' ' }).toString()).toBe(
      'from=2026-11-01&to=2026-11-02',
    )
  })

  it('default range covers the last 7 local days', () => {
    expect(defaultActivityRange(new Date(2026, 10, 10))).toEqual({
      from: '2026-11-04',
      to: '2026-11-10',
    })
  })

  it('renders Persian labels, Jalali time, outcome badges and escapes HTML', () => {
    const html = buildActivityRowsHtml(SAMPLE)
    expect(html).toContain('ورود/خروج')
    expect(html).toContain('خطای سرور')
    expect(html).toContain('ناموفق')
    expect(html).toContain('موفق')
    expect(html).toContain('۱۹ آبان ۱۴۰۵')
    expect(html).toContain('/api/v1/reports/profit')
    expect(html).toContain('مدیر نمونه · مدیر')
    expect(html).toContain('7f3c2a10')
    expect(html).not.toContain('<b>ماهانه</b>')
    expect(html).toContain('&lt;b&gt;')
  })

  it('shows an empty hint when nothing matched (edge)', () => {
    expect(buildActivityRowsHtml([])).toContain('رویدادی ثبت نشده')
  })

  it('counts failures and server errors', () => {
    expect(countActivity(SAMPLE)).toEqual({ fail: 2, errors: 1 })
  })

  it('reads export filename from Content-Disposition with fallback', () => {
    expect(
      filenameFromDisposition('attachment; filename="gym-activity-20261104-20261110.log"'),
    ).toBe('gym-activity-20261104-20261110.log')
    expect(filenameFromDisposition(null)).toBeNull()
    expect(fallbackExportFilename({ from: '2026-11-04', to: '2026-11-10' })).toBe(
      'gym-activity-20261104-20261110.log',
    )
  })
})

describe('mountActivity', () => {
  it('blocks non-manager roles without calling the API', () => {
    const fetchMock = vi.fn()
    vi.stubGlobal('fetch', fetchMock)
    const host = document.createElement('div')
    mountActivity(host, { role: 'receptionist' })
    expect(host.textContent).toContain('فقط برای مدیر')
    expect(fetchMock).not.toHaveBeenCalled()
  })

  it('loads activity for manager and paints rows + stats', async () => {
    const fetchMock = vi.fn(async () => ({
      ok: true,
      status: 200,
      json: async () => ({
        items: SAMPLE,
        from: '2026-11-04',
        to: '2026-11-10',
        next_cursor: null,
        categories: ['auth', 'errors'],
      }),
    }))
    vi.stubGlobal('fetch', fetchMock)
    const section = document.createElement('div')
    section.setAttribute('data-section', 'activity')
    const host = document.createElement('div')
    section.appendChild(host)
    document.body.appendChild(section)

    mountActivity(host, { role: 'manager' })
    await vi.waitFor(() => {
      expect(host.querySelectorAll('.activity-row').length).toBe(3)
    })
    const url = String(fetchMock.mock.calls[0][0])
    expect(url).toContain('/api/v1/manager/activity?')
    expect(url).toContain('from=')
    expect(host.querySelector('[data-activity-stats]')?.textContent).toContain('ناموفق')
    expect(host.querySelector('[data-activity-more]')?.hasAttribute('hidden')).toBe(true)
    expect(host.querySelector('[data-activity-export]')?.textContent).toContain('.log')
  })
})

describe('manager panel wiring', () => {
  it('adds #activity nav + section only on the manager panel', () => {
    const manager = readFileSync(join(root, 'manager/index.html'), 'utf8')
    expect(manager).toContain('href="#activity"')
    expect(manager).toContain('data-section="activity"')
    expect(manager).toContain('id="mount-activity"')
    const receptionist = readFileSync(join(root, 'receptionist/index.html'), 'utf8')
    expect(receptionist).not.toContain('#activity')
    expect(NAV_ICON_BY_HASH.activity).toBe('pulse')
  })
})
