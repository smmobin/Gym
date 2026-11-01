import { readFileSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { afterEach, describe, expect, it, vi } from 'vitest'

vi.mock('../assets/js/members.js', () => ({
  bindMemberSearch: vi.fn(),
  personSelectRowHtml: () =>
    `<div class="person-select"><input data-q /><div data-pick></div><div data-selected data-person-chip></div></div>`,
  setPersonChip: vi.fn(),
}))

vi.mock('../assets/js/api.js', () => ({
  ApiError: class ApiError extends Error {
    constructor(status, message) {
      super(message)
      this.status = status
    }
  },
  apiGet: vi.fn(async () => ({ items: [] })),
  apiPost: vi.fn(),
}))

vi.mock('../assets/js/lock.js', () => ({
  createMemberLock: (onChange) => ({
    setMember: vi.fn(async () => {
      onChange?.({ held_by_me: true, locked: true })
    }),
  }),
  lockErrorMessage: (_e, fb) => fb,
}))

vi.mock('../assets/js/auto-refresh.js', () => ({
  createAutoRefresh: () => ({ refresh: vi.fn(), stop: vi.fn() }),
}))

vi.mock('../assets/js/live-data.js', () => ({
  emitLive: vi.fn(),
  LIVE: { ATTENDANCE: 'attendance' },
}))

vi.mock('../assets/js/pagination.js', () => ({
  createListPager: () => ({
    reset() {},
    paint(_items, fn) {
      fn(_items || [])
    },
  }),
}))

vi.mock('../assets/js/ui.js', () => ({
  setStatus: vi.fn(),
}))

import { ApiError, apiPost } from '../assets/js/api.js'
import { bindMemberSearch } from '../assets/js/members.js'
import { mountAttendance } from '../assets/js/attendance.js'

describe('attendance type option copy', () => {
  it('includes short explanations next to سالن / کلاس / جلسه مربی', () => {
    const src = readFileSync(
      join(dirname(fileURLToPath(import.meta.url)), '../assets/js/attendance.js'),
      'utf8',
    )
    expect(src).toMatch(/value="gym"[^>]*>سالن —/)
    expect(src).toMatch(/value="class"[^>]*>کلاس —/)
    expect(src).toMatch(/value="pt"[^>]*>جلسه مربی —/)
    expect(src).toContain('تمرین آزاد')
    expect(src).toContain('کلاس گروهی')
    expect(src).toContain('مصرف جدا')
  })
})

describe('second-visit confirm button visibility', () => {
  afterEach(() => {
    document.body.innerHTML = ''
    vi.mocked(apiPost).mockReset()
    vi.mocked(bindMemberSearch).mockReset()
  })

  it('keeps تأیید ورود دوم hidden until server asks for confirm', async () => {
    /** @type {(m: object) => void} */
    let onPick = () => {}
    vi.mocked(bindMemberSearch).mockImplementation((_pick, _input, cb) => {
      onPick = cb
    })
    vi.mocked(apiPost).mockRejectedValueOnce(
      new ApiError(409, 'ورود دوم در همین روز نیاز به تأیید منشی دارد.'),
    )

    const root = document.createElement('div')
    document.body.appendChild(root)
    mountAttendance(root, { role: 'receptionist' })

    const second = /** @type {HTMLButtonElement} */ (root.querySelector('[data-second]'))
    expect(second).toBeTruthy()
    expect(second.hidden).toBe(true)

    onPick({ id: 7, first_name: 'تست', last_name: 'عضو', display_id: 'M-7' })
    expect(second.hidden).toBe(true)

    root.querySelector('[data-checkin]')?.dispatchEvent(new MouseEvent('click', { bubbles: true }))
    await vi.waitFor(() => expect(second.hidden).toBe(false))

    vi.mocked(apiPost).mockResolvedValueOnce({
      debt_warning: null,
      debt_toman: 0,
      sessions_remaining: null,
    })
    second.dispatchEvent(new MouseEvent('click', { bubbles: true }))
    await vi.waitFor(() => expect(second.hidden).toBe(true))
  })
})
