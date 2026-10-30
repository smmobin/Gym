import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

vi.mock('../assets/js/members.js', () => ({
  bindMemberSearch: vi.fn(),
  personSelectRowHtml: () =>
    `<div class="person-select"><label>عضو<input data-sms-member-q /></label><div data-sms-member-pick></div><div data-sms-member-label data-person-chip></div></div>`,
  setPersonChip: vi.fn(),
}))

vi.mock('../assets/js/api.js', () => ({
  ApiError: class ApiError extends Error {
    constructor(status, message) {
      super(message)
      this.status = status
    }
  },
  apiGet: vi.fn(),
  apiPost: vi.fn(),
}))

import { apiGet } from '../assets/js/api.js'
import { bindMemberSearch } from '../assets/js/members.js'
import {
  formatBodyHtml,
  mountSmsTemplates,
  previewVarsFromMember,
  renderBodyText,
  smsCharStats,
} from '../assets/js/sms-templates.js'

describe('sms templates card UI', () => {
  beforeEach(() => {
    vi.mocked(apiGet).mockReset()
    vi.mocked(bindMemberSearch).mockReset()
  })

  afterEach(() => {
    document.body.innerHTML = ''
  })

  it('smsCharStats counts unicode segments by 70', () => {
    expect(smsCharStats('').segments).toBe(0)
    expect(smsCharStats('سلام').len).toBe(4)
    expect(smsCharStats('سلام').segments).toBe(1)
    expect(smsCharStats('a'.repeat(161)).segments).toBe(2)
  })

  it('previewVarsFromMember fills name and display_id', () => {
    const vars = previewVarsFromMember(
      { first_name: 'علی', last_name: 'رضایی', display_id: 'M-1001' },
      { end_date: '۷ آبان ۱۴۰۵', debt: '۱٬۲۰۰٬۰۰۰' },
    )
    expect(vars).toEqual({
      name: 'علی رضایی',
      display_id: 'M-1001',
      end_date: '۷ آبان ۱۴۰۵',
      debt: '۱٬۲۰۰٬۰۰۰',
    })
    expect(previewVarsFromMember(null)).toBeNull()
  })

  it('formatBodyHtml / renderBodyText swap tags for selected values', () => {
    const vars = { name: 'مینا', display_id: 'M-9', end_date: '—', debt: '۰' }
    expect(renderBodyText('سلام {{name}}، کد {{display_id}}', vars)).toBe('سلام مینا، کد M-9')
    const html = formatBodyHtml('سلام {{name}}', vars)
    expect(html).toContain('is-filled')
    expect(html).toContain('مینا')
    expect(html).not.toContain('{{name}}')
    expect(formatBodyHtml('سلام {{name}}', null)).toContain('{{name}}')
  })

  it('renders card grid with quick-send and custom composer when enabled', async () => {
    vi.mocked(apiGet).mockImplementation(async (url) => {
      if (String(url).includes('/sms/status')) {
        return { enabled: true, provider: 'fake', label: 'پیامک فعال (حالت آزمایشی — ارسال واقعی نیست)' }
      }
      if (String(url).includes('/sms/templates')) {
        return {
          items: [
            { id: 'welcome', title: 'خوش‌آمد', body: 'سلام {{name}}' },
            { id: 'expiry', title: 'انقضا', body: '{{end_date}}' },
            { id: 'debt', title: 'بدهی', body: '{{debt}}' },
          ],
          total: 3,
        }
      }
      return {}
    })

    const root = document.createElement('div')
    document.body.appendChild(root)
    mountSmsTemplates(root)

    await vi.waitFor(() => {
      expect(root.querySelector('.sms-grid')).toBeTruthy()
    })
    expect(root.querySelectorAll('.sms-card').length).toBeGreaterThanOrEqual(3)
    expect(root.querySelector('[data-sms-send="welcome"]')?.textContent).toContain('ارسال سریع')
    expect(root.querySelector('[data-sms-custom]')).toBeTruthy()
    expect(root.querySelector('[data-sms-custom-text]')).toBeTruthy()
    expect(root.querySelector('[data-sms-custom-send]')?.textContent).toContain('ارسال پیام دلخواه')
    expect(root.textContent).toContain('{{name}}')
  })

  it('replaces {{name}} with selected member data in card bodies', async () => {
    /** @type {(m: object) => void} */
    let onPick = () => {}
    vi.mocked(bindMemberSearch).mockImplementation((_pick, _input, cb) => {
      onPick = cb
    })
    vi.mocked(apiGet).mockImplementation(async (url) => {
      const path = String(url)
      if (path.includes('/sms/status')) {
        return { enabled: true, provider: 'fake', label: 'پیامک آزمایشی' }
      }
      if (path.includes('/sms/templates')) {
        return {
          items: [{ id: 'welcome', title: 'خوش‌آمد', body: 'سلام {{name}}، کد {{display_id}}' }],
          total: 1,
        }
      }
      if (path.includes('/memberships')) {
        return {
          items: [{ end_date: '2026-11-01', status: 'active' }],
          debt_toman: 250000,
        }
      }
      return {}
    })

    const root = document.createElement('div')
    document.body.appendChild(root)
    mountSmsTemplates(root)

    await vi.waitFor(() => {
      expect(root.querySelector('.sms-grid')).toBeTruthy()
      expect(bindMemberSearch).toHaveBeenCalled()
    })
    expect(root.textContent).toContain('{{name}}')

    onPick({ id: 42, first_name: 'سارا', last_name: 'کریمی', display_id: 'M-2042' })

    await vi.waitFor(() => {
      expect(root.textContent).toContain('سارا کریمی')
      expect(root.textContent).toContain('M-2042')
      expect(root.textContent).not.toContain('{{name}}')
      expect(root.querySelector('.sms-ph.is-filled')).toBeTruthy()
    })
  })
})
