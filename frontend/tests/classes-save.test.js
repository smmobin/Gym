import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

vi.mock('../assets/js/members.js', () => ({
  bindMemberSearch: vi.fn(),
}))

vi.mock('../assets/js/ui.js', () => ({
  setStatus: vi.fn(),
}))

vi.mock('../assets/js/api.js', () => ({
  ApiError: class ApiError extends Error {
    /** @param {number} status @param {string} message */
    constructor(status, message) {
      super(message)
      this.status = status
    }
  },
  apiErrorMessage: (err, fallback) => (err instanceof Error ? err.message : fallback),
  apiGet: vi.fn(),
  apiPost: vi.fn(),
  apiPatch: vi.fn(),
}))

import { apiGet, apiPatch, apiPost } from '../assets/js/api.js'
import { mountClasses } from '../assets/js/classes.js'

function fillClassForm(form, { title = 'کلاس تست', capacity = '8', gender = 'men', start, end } = {}) {
  const starts = start || '2030-06-01T10:00'
  const endsAt = end || '2030-06-01T11:00'
  const titleEl = form.querySelector('[name=title]')
  const capacityEl = form.querySelector('[name=capacity]')
  const genderSel = form.querySelector('[name=gender_label]')
  const startsEl = form.querySelector('[name=starts_at]')
  const endsEl = form.querySelector('[name=ends_at]')
  if (!(titleEl instanceof HTMLInputElement)) throw new Error('title')
  if (!(capacityEl instanceof HTMLInputElement)) throw new Error('capacity')
  if (!(genderSel instanceof HTMLSelectElement)) throw new Error('gender')
  if (!(startsEl instanceof HTMLInputElement)) throw new Error('starts')
  if (!(endsEl instanceof HTMLInputElement)) throw new Error('ends')
  titleEl.value = title
  capacityEl.value = capacity
  genderSel.value = gender
  startsEl.value = starts
  endsEl.value = endsAt
}

describe('class save anti-duplicate (BUG-007)', () => {
  beforeEach(() => {
    vi.mocked(apiGet).mockReset()
    vi.mocked(apiPost).mockReset()
    vi.mocked(apiPatch).mockReset()
    vi.mocked(apiGet).mockResolvedValue({ items: [], total: 0 })
  })

  afterEach(() => {
    document.body.innerHTML = ''
  })

  it('after create, keeps returned id so a second save PATCHes instead of POSTing again', async () => {
    vi.mocked(apiPost).mockResolvedValue({
      group_class: {
        id: 42,
        title: 'کلاس تست',
        capacity: 8,
        gender_label: 'men',
        booked_count: 0,
        remaining: 8,
        starts_at: '2030-06-01T06:30:00.000Z',
        ends_at: '2030-06-01T07:30:00.000Z',
        is_active: true,
      },
      trainer_schedule_conflict: false,
    })
    vi.mocked(apiPatch).mockResolvedValue({
      group_class: {
        id: 42,
        title: 'کلاس تست',
        capacity: 8,
        gender_label: 'men',
        booked_count: 0,
        remaining: 8,
        starts_at: '2030-06-01T06:30:00.000Z',
        ends_at: '2030-06-01T07:30:00.000Z',
        is_active: true,
      },
      trainer_schedule_conflict: false,
    })

    const root = document.createElement('div')
    document.body.appendChild(root)
    mountClasses(root, { role: 'receptionist' })

    await vi.waitFor(() => {
      expect(root.querySelector('[data-class-form]')).toBeTruthy()
    })

    const form = /** @type {HTMLFormElement} */ (root.querySelector('[data-class-form]'))
    fillClassForm(form)
    form.dispatchEvent(new Event('submit', { bubbles: true, cancelable: true }))

    await vi.waitFor(() => {
      expect(apiPost).toHaveBeenCalledTimes(1)
    })
    expect(apiPost.mock.calls[0][0]).toBe('/api/v1/group-classes')

    const idInput = /** @type {HTMLInputElement} */ (form.querySelector('[name=id]'))
    await vi.waitFor(() => {
      expect(idInput.value).toBe('42')
    })
    expect(/** @type {HTMLInputElement} */ (form.querySelector('[name=title]')).value).toBe('کلاس تست')

    form.dispatchEvent(new Event('submit', { bubbles: true, cancelable: true }))
    await vi.waitFor(() => {
      expect(apiPatch).toHaveBeenCalledTimes(1)
    })
    expect(apiPatch.mock.calls[0][0]).toBe('/api/v1/group-classes/42')
    expect(apiPost).toHaveBeenCalledTimes(1)
  })

  it('disables save while request is in flight and ignores overlapping submit', async () => {
    let resolvePost
    const postPromise = new Promise((resolve) => {
      resolvePost = resolve
    })
    vi.mocked(apiPost).mockReturnValue(postPromise)

    const root = document.createElement('div')
    document.body.appendChild(root)
    mountClasses(root, { role: 'manager' })

    await vi.waitFor(() => {
      expect(root.querySelector('[data-class-form]')).toBeTruthy()
    })

    const form = /** @type {HTMLFormElement} */ (root.querySelector('[data-class-form]'))
    const submitBtn = /** @type {HTMLButtonElement} */ (form.querySelector('[type="submit"]'))
    fillClassForm(form, { title: 'قفل دابل' })

    form.dispatchEvent(new Event('submit', { bubbles: true, cancelable: true }))
    await vi.waitFor(() => {
      expect(submitBtn.disabled).toBe(true)
      expect(form.dataset.busy).toBe('1')
    })

    form.dispatchEvent(new Event('submit', { bubbles: true, cancelable: true }))
    expect(apiPost).toHaveBeenCalledTimes(1)

    resolvePost({
      group_class: {
        id: 7,
        title: 'قفل دابل',
        capacity: 8,
        gender_label: 'men',
        booked_count: 0,
        remaining: 8,
        starts_at: '2030-06-01T06:30:00.000Z',
        ends_at: '2030-06-01T07:30:00.000Z',
        is_active: true,
      },
      trainer_schedule_conflict: false,
    })

    await vi.waitFor(() => {
      expect(submitBtn.disabled).toBe(false)
      expect(form.dataset.busy).toBe('0')
      expect(/** @type {HTMLInputElement} */ (form.querySelector('[name=id]')).value).toBe('7')
    })
  })

  it('renders deactivate for active classes with zero bookings', async () => {
    vi.mocked(apiGet).mockResolvedValue({
      items: [
        {
          id: 9,
          title: 'بدون رزرو',
          capacity: 10,
          booked_count: 0,
          remaining: 10,
          gender_label: 'mixed',
          starts_at: '2030-07-01T08:00:00.000Z',
          ends_at: '2030-07-01T09:00:00.000Z',
          is_active: true,
        },
        {
          id: 10,
          title: 'با رزرو',
          capacity: 10,
          booked_count: 2,
          remaining: 8,
          gender_label: 'women',
          starts_at: '2030-07-02T08:00:00.000Z',
          ends_at: '2030-07-02T09:00:00.000Z',
          is_active: true,
        },
      ],
      total: 2,
    })

    const root = document.createElement('div')
    document.body.appendChild(root)
    mountClasses(root, { role: 'receptionist' })

    await vi.waitFor(() => {
      expect(root.querySelector('[data-deactivate="9"]')).toBeTruthy()
    })
    expect(root.querySelector('[data-deactivate="10"]')).toBeNull()
  })
})

describe('class list focus after save (BUG-008)', () => {
  beforeEach(() => {
    vi.mocked(apiGet).mockReset()
    vi.mocked(apiPost).mockReset()
    vi.mocked(apiPatch).mockReset()
  })

  afterEach(() => {
    document.body.innerHTML = ''
  })

  it('after create, paints the page that contains the new class (not stuck on page 1)', async () => {
    const seed = Array.from({ length: 5 }, (_, i) => ({
      id: i + 1,
      title: `قدیمی ${i + 1}`,
      capacity: 10,
      booked_count: 0,
      remaining: 10,
      gender_label: 'mixed',
      starts_at: `2020-01-0${i + 1}T08:00:00.000Z`,
      ends_at: `2020-01-0${i + 1}T09:00:00.000Z`,
      is_active: true,
    }))
    const created = {
      id: 99,
      title: 'کلاس آینده دیده شو',
      capacity: 8,
      booked_count: 0,
      remaining: 8,
      gender_label: 'men',
      starts_at: '2030-06-01T06:30:00.000Z',
      ends_at: '2030-06-01T07:30:00.000Z',
      is_active: true,
    }
    let listPayload = { items: seed, total: seed.length }
    vi.mocked(apiGet).mockImplementation(async () => listPayload)
    vi.mocked(apiPost).mockImplementation(async () => {
      listPayload = { items: [...seed, created], total: seed.length + 1 }
      return { group_class: created, trainer_schedule_conflict: false }
    })

    const root = document.createElement('div')
    document.body.appendChild(root)
    mountClasses(root, { role: 'receptionist' })

    await vi.waitFor(() => {
      expect(root.querySelector('[data-tbody]')?.textContent).toContain('قدیمی 1')
    })
    expect(root.querySelector('[data-tbody]')?.textContent || '').not.toContain('کلاس آینده دیده شو')

    const form = /** @type {HTMLFormElement} */ (root.querySelector('[data-class-form]'))
    fillClassForm(form, { title: 'کلاس آینده دیده شو' })
    form.dispatchEvent(new Event('submit', { bubbles: true, cancelable: true }))

    await vi.waitFor(() => {
      const text = root.querySelector('[data-tbody]')?.textContent || ''
      expect(text).toContain('کلاس آینده دیده شو')
    })
    const pagerStatus = root.querySelector('.list-pager-status')?.textContent || ''
    expect(pagerStatus).toMatch(/۲|2/)
  })
})
