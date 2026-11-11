import { afterEach, describe, expect, it, vi } from 'vitest'

import { buildRecentExpensesHtml } from '../assets/js/dashboard.js'
import { buildDeskActionPanelHtml } from '../assets/js/desk-dashboard.js'
import { escapeAttr, escapeHtml, safeHttpUrl } from '../assets/js/html.js'
import { lockersTableRowsHtml, membershipEligibilityHtml } from '../assets/js/lockers.js'
import { mountMembers } from '../assets/js/members.js'
import { mountTrialLeads } from '../assets/js/trial.js'

const PAYLOAD = '<img src=x onerror=alert(1)>'
const ATTR_PAYLOAD = '" onmouseover="alert(1)'

/** @param {string} html */
function render(html) {
  const host = document.createElement('div')
  host.innerHTML = html
  return host
}

/** @param {string} html */
function expectInert(html) {
  expect(html).toContain('&lt;img')
  expect(html).not.toContain('<img')
  const host = render(html)
  expect(host.querySelector('img')).toBeNull()
  expect(host.querySelector('[onerror]')).toBeNull()
}

describe('escapeHtml', () => {
  it('escapes all HTML-significant characters', () => {
    expect(escapeHtml(`<a href="x" title='y'>&\`</a>`)).toBe(
      '&lt;a href=&quot;x&quot; title=&#39;y&#39;&gt;&amp;&#96;&lt;/a&gt;',
    )
  })

  it('maps null / undefined to empty string and stringifies numbers', () => {
    expect(escapeHtml(null)).toBe('')
    expect(escapeHtml(undefined)).toBe('')
    expect(escapeHtml(0)).toBe('0')
    expect(escapeHtml(42)).toBe('42')
  })

  it('keeps Persian text untouched', () => {
    expect(escapeHtml('سارا رضایی · ۰۹۱۲')).toBe('سارا رضایی · ۰۹۱۲')
  })

  it('escapeAttr cannot break out of a quoted attribute', () => {
    const host = render(`<span data-x="${escapeAttr(ATTR_PAYLOAD)}"></span>`)
    const span = host.querySelector('span')
    expect(span?.getAttribute('onmouseover')).toBeNull()
    expect(span?.getAttribute('data-x')).toBe(ATTR_PAYLOAD)
  })
})

describe('safeHttpUrl', () => {
  it('allows http(s) URLs', () => {
    expect(safeHttpUrl('https://pay.example.com/start?id=1')).toBe('https://pay.example.com/start?id=1')
    expect(safeHttpUrl('http://localhost:8000/pay')).toBe('http://localhost:8000/pay')
  })

  it('rejects javascript:, data: and empty values', () => {
    expect(safeHttpUrl('javascript:alert(1)')).toBeNull()
    expect(safeHttpUrl(' JavaScript:alert(1)')).toBeNull()
    expect(safeHttpUrl('data:text/html,<script>alert(1)</script>')).toBeNull()
    expect(safeHttpUrl('')).toBeNull()
    expect(safeHttpUrl(null)).toBeNull()
  })
})

describe('HTML builders escape API data', () => {
  it('dashboard recent expenses escapes category and note', () => {
    const html = buildRecentExpensesHtml([
      { category: PAYLOAD, note: PAYLOAD, amount_toman: 1000, expense_date: '2026-11-01' },
    ])
    expectInert(html)
  })

  it('locker table escapes code, occupant name and ids', () => {
    const html = lockersTableRowsHtml([
      {
        id: /** @type {any} */ (ATTR_PAYLOAD),
        code: PAYLOAD,
        is_free: false,
        is_active: true,
        current_assignment: { member_name: PAYLOAD },
      },
    ])
    expectInert(`<table><tbody>${html}</tbody></table>`)
    const host = render(`<table><tbody>${html}</tbody></table>`)
    expect(host.querySelector('[onmouseover]')).toBeNull()
    expect(host.querySelector('[data-sel]')?.getAttribute('data-sel')).toBe(ATTR_PAYLOAD)
  })

  it('locker eligibility escapes plan name entered by staff', () => {
    const html = membershipEligibilityHtml(
      [{ id: 1, plan_id: 2, plan_name: PAYLOAD, status: 'active', start_date: '2026-01-01', end_date: '2026-02-01' }],
      new Set([2]),
    )
    expectInert(html)
  })

  it('desk action panel drops javascript: hrefs', () => {
    const html = buildDeskActionPanelHtml(
      PAYLOAD,
      'خالی',
      [{ title: PAYLOAD, body: PAYLOAD, href: 'javascript:alert(1)' }],
      'javascript:alert(2)',
      'بیشتر',
    )
    expectInert(html)
    expect(html).not.toContain('javascript:')
    const external = buildDeskActionPanelHtml('عنوان', 'خالی', [], 'https://evil.example/phish', 'بیشتر')
    expect(external).toContain('href="#"')
    expect(external).not.toContain('evil.example')
  })
})

describe('mounted panels escape stored payloads', () => {
  afterEach(() => {
    vi.useRealTimers()
    vi.unstubAllGlobals()
    document.body.innerHTML = ''
  })

  it('trial lead queue (public form → staff) renders name/message as text', async () => {
    const fetchMock = vi.fn(async () => ({
      ok: true,
      status: 200,
      json: async () => ({
        items: [
          {
            id: 9,
            full_name: PAYLOAD,
            mobile: '09120000000',
            preferred_time_note: PAYLOAD,
            message: PAYLOAD,
            status: 'new',
            created_at: '2026-11-10T10:00:00Z',
          },
        ],
      }),
    }))
    vi.stubGlobal('fetch', fetchMock)

    const root = document.createElement('div')
    document.body.appendChild(root)
    mountTrialLeads(root, { role: 'receptionist' })

    await vi.waitFor(() => {
      expect(root.querySelector('.trial-row')).toBeTruthy()
    })
    const list = /** @type {HTMLElement} */ (root.querySelector('[data-list]'))
    expect(list.querySelector('img')).toBeNull()
    expect(list.querySelector('h3')?.textContent).toContain(PAYLOAD)
    expect(list.textContent).toContain(PAYLOAD)
    expect(list.querySelector('select')?.getAttribute('aria-label')).toBe(`وضعیت ${PAYLOAD}`)
  })

  it('members table (athlete-editable name → staff) renders name as text', async () => {
    const fetchMock = vi.fn(async () => ({
      ok: true,
      status: 200,
      json: async () => ({
        items: [
          {
            id: 1,
            display_id: 'M-1',
            first_name: PAYLOAD,
            last_name: 'تست',
            mobile: '09120000001',
            status: 'active',
          },
        ],
        total: 1,
      }),
    }))
    vi.stubGlobal('fetch', fetchMock)

    const root = document.createElement('div')
    const section = document.createElement('div')
    section.setAttribute('data-section', 'members')
    section.appendChild(root)
    document.body.appendChild(section)
    mountMembers(root, { role: 'manager' })

    await vi.waitFor(() => {
      expect(root.querySelector('[data-tbody] tr')).toBeTruthy()
    })
    const tbody = /** @type {HTMLElement} */ (root.querySelector('[data-tbody]'))
    expect(tbody.querySelector('img')).toBeNull()
    expect(tbody.textContent).toContain(PAYLOAD)
    expect(tbody.innerHTML).toContain('&lt;img')
  })
})
