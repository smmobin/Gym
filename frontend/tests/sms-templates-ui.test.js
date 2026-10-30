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
import { mountSmsTemplates, smsCharStats } from '../assets/js/sms-templates.js'

describe('sms templates card UI', () => {
  beforeEach(() => {
    vi.mocked(apiGet).mockReset()
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
})
