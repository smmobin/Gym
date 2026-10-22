import { afterEach, describe, expect, it, vi } from 'vitest'

import {
  DEFAULT_EXPENSE_CATEGORIES,
  EXPENSE_CATEGORY_CUSTOM,
  expenseCategoryLabel,
  fillExpenseCategorySelect,
  mergeExpenseCategories,
  normalizeExpenseCategoryInput,
} from '../assets/js/expense-categories.js'

describe('expense categories', () => {
  afterEach(() => {
    document.body.innerHTML = ''
    // @ts-expect-error test cleanup
    delete globalThis.GymCustomSelect
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
    expect(normalizeExpenseCategoryInput(EXPENSE_CATEGORY_CUSTOM)).toBe('')
  })

  it('merges customs into the list without duplicating defaults', () => {
    const merged = mergeExpenseCategories([
      { value: 'rent', label: 'اجاره' },
      { value: 'تعمیرات', label: 'تعمیرات' },
      'قبوض', // Persian label for utilities — must not create a duplicate custom
    ])
    expect(merged.filter((c) => c.value === 'rent')).toHaveLength(1)
    expect(merged.filter((c) => c.value === 'utilities')).toHaveLength(1)
    expect(merged.some((c) => c.value === 'تعمیرات')).toBe(true)
    expect(merged.some((c) => c.value === 'قبوض')).toBe(false)
  })

  it('fills a select with labels, stored values, and custom sentinel', () => {
    const sync = vi.fn()
    globalThis.GymCustomSelect = { sync, refresh: vi.fn() }

    const select = document.createElement('select')
    document.body.appendChild(select)
    fillExpenseCategorySelect(select, [
      { value: 'rent', label: 'اجاره' },
      { value: 'تعمیرات', label: 'تعمیرات' },
    ])

    const opts = [...select.options]
    expect(opts[0].value).toBe('')
    expect(opts[0].disabled).toBe(true)
    expect(opts.map((o) => o.value)).toEqual(['', 'rent', 'تعمیرات', EXPENSE_CATEGORY_CUSTOM])
    expect(opts.map((o) => o.textContent)).toEqual([
      'انتخاب دسته…',
      'اجاره',
      'تعمیرات',
      'دستهٔ جدید…',
    ])
    expect(sync).toHaveBeenCalledWith(select)
  })
})
