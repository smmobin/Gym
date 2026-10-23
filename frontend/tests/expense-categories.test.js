import { afterEach, describe, expect, it } from 'vitest'

import {
  DEFAULT_EXPENSE_CATEGORIES,
  expenseCategoryLabel,
  filterExpenseCategories,
  mergeExpenseCategories,
  mountExpenseCategoryCombobox,
  normalizeExpenseCategoryInput,
} from '../assets/js/expense-categories.js'

describe('expense categories', () => {
  afterEach(() => {
    document.body.innerHTML = ''
  })

  it('has built-in Persian defaults', () => {
    expect(DEFAULT_EXPENSE_CATEGORIES.map((c) => c.value)).toEqual([
      'rent',
      'salary',
      'purchase',
      'utilities',
      'other',
    ])
    expect(expenseCategoryLabel('rent')).toBe('اجاره')
    expect(expenseCategoryLabel('تعمیرات')).toBe('تعمیرات')
  })

  it('normalizes Persian labels and keeps custom text', () => {
    expect(normalizeExpenseCategoryInput('حقوق')).toBe('salary')
    expect(normalizeExpenseCategoryInput('purchase')).toBe('purchase')
    expect(normalizeExpenseCategoryInput('  تعمیرات  ')).toBe('تعمیرات')
    expect(normalizeExpenseCategoryInput('')).toBe('')
  })

  it('merges customs into the list without duplicating defaults', () => {
    const merged = mergeExpenseCategories([
      { value: 'rent', label: 'اجاره' },
      { value: 'تعمیرات', label: 'تعمیرات' },
      'قبوض',
    ])
    expect(merged.filter((c) => c.value === 'rent')).toHaveLength(1)
    expect(merged.filter((c) => c.value === 'utilities')).toHaveLength(1)
    expect(merged.some((c) => c.value === 'تعمیرات')).toBe(true)
    expect(merged.some((c) => c.value === 'قبوض')).toBe(false)
  })

  it('filters categories by typed query', () => {
    const cats = mergeExpenseCategories([{ value: 'تعمیرات', label: 'تعمیرات' }])
    expect(filterExpenseCategories('اج', cats).map((c) => c.value)).toEqual(['rent'])
    expect(filterExpenseCategories('تعمیر', cats).some((c) => c.value === 'تعمیرات')).toBe(true)
    expect(filterExpenseCategories('', cats).length).toBe(cats.length)
  })

  it('mounts a single combobox field (type + pick, no second input)', () => {
    const host = document.createElement('div')
    document.body.appendChild(host)
    const api = mountExpenseCategoryCombobox(host, {
      categories: [
        { value: 'rent', label: 'اجاره' },
        { value: 'تعمیرات', label: 'تعمیرات' },
      ],
    })

    const input = /** @type {HTMLInputElement} */ (host.querySelector('.custom-combobox-input'))
    expect(input).toBeTruthy()
    expect(input.name).toBe('category')
    expect(host.querySelector('[name=category_custom]')).toBeNull()

    input.focus()
    expect(host.querySelector('[data-expense-combobox]')?.classList.contains('is-open')).toBe(true)
    const options = [...host.querySelectorAll('[role="option"]')]
    expect(options.map((o) => o.textContent)).toEqual(['اجاره', 'تعمیرات'])

    options[0].dispatchEvent(new MouseEvent('click', { bubbles: true }))
    expect(input.value).toBe('اجاره')
    expect(normalizeExpenseCategoryInput(api.getRawValue())).toBe('rent')

    input.value = 'نوسازی'
    input.dispatchEvent(new Event('input', { bubbles: true }))
    expect(normalizeExpenseCategoryInput(api.getRawValue())).toBe('نوسازی')

    api.clear()
    expect(input.value).toBe('')
    api.destroy()
  })
})
