import { describe, expect, it } from 'vitest'

import {
  DEFAULT_EXPENSE_CATEGORIES,
  expenseCategoryLabel,
  fillExpenseCategoryDatalist,
  mergeExpenseCategories,
  normalizeExpenseCategoryInput,
} from '../assets/js/expense-categories.js'

describe('expense categories', () => {
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
      'قبوض', // Persian label for utilities — must not create a duplicate custom
    ])
    expect(merged.filter((c) => c.value === 'rent')).toHaveLength(1)
    expect(merged.filter((c) => c.value === 'utilities')).toHaveLength(1)
    expect(merged.some((c) => c.value === 'تعمیرات')).toBe(true)
    expect(merged.some((c) => c.value === 'قبوض')).toBe(false)
  })

  it('fills datalist with labels', () => {
    const list = document.createElement('datalist')
    fillExpenseCategoryDatalist(list, [
      { value: 'rent', label: 'اجاره' },
      { value: 'تعمیرات', label: 'تعمیرات' },
    ])
    const values = [...list.querySelectorAll('option')].map((o) => o.value)
    expect(values).toEqual(['اجاره', 'تعمیرات'])
  })
})
