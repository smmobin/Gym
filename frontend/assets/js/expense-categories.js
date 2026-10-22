/** Built-in expense categories (value stored in API ↔ Persian label in UI). */
export const DEFAULT_EXPENSE_CATEGORIES = [
  { value: 'rent', label: 'اجاره' },
  { value: 'salary', label: 'حقوق' },
  { value: 'purchase', label: 'خرید' },
  { value: 'utilities', label: 'قبوض' },
  { value: 'other', label: 'سایر' },
]

const LABEL_TO_VALUE = Object.fromEntries(
  DEFAULT_EXPENSE_CATEGORIES.map((c) => [c.label, c.value]),
)
const VALUE_TO_LABEL = Object.fromEntries(
  DEFAULT_EXPENSE_CATEGORIES.map((c) => [c.value, c.label]),
)

/**
 * @param {string} value
 */
export function expenseCategoryLabel(value) {
  const key = String(value || '').trim()
  return VALUE_TO_LABEL[key] || key || '—'
}

/**
 * Map typed/selected label or English value to stored category.
 * Unknown text is kept as a new custom category.
 * @param {string} raw
 */
export function normalizeExpenseCategoryInput(raw) {
  const value = String(raw || '').trim()
  if (!value) return ''
  if (VALUE_TO_LABEL[value]) return value
  if (LABEL_TO_VALUE[value]) return LABEL_TO_VALUE[value]
  return value
}

/**
 * Merge defaults with API/custom items (by value).
 * @param {Array<{ value?: string, label?: string } | string>} [extra]
 */
export function mergeExpenseCategories(extra = []) {
  /** @type {Map<string, { value: string, label: string }>} */
  const map = new Map()
  for (const c of DEFAULT_EXPENSE_CATEGORIES) {
    map.set(c.value, { ...c })
  }
  for (const item of extra) {
    if (typeof item === 'string') {
      const value = normalizeExpenseCategoryInput(item)
      if (!value || map.has(value)) continue
      map.set(value, { value, label: expenseCategoryLabel(value) })
      continue
    }
    const value = normalizeExpenseCategoryInput(String(item?.value || ''))
    if (!value || map.has(value)) continue
    const label = String(item?.label || '').trim() || expenseCategoryLabel(value)
    map.set(value, { value, label })
  }
  return [...map.values()]
}

/**
 * Fill a <datalist> with category options (labels shown to the user).
 * @param {HTMLDataListElement | null} listEl
 * @param {Array<{ value: string, label: string }>} categories
 */
export function fillExpenseCategoryDatalist(listEl, categories) {
  if (!listEl) return
  listEl.innerHTML = ''
  for (const c of categories) {
    const opt = document.createElement('option')
    opt.value = c.label
    listEl.appendChild(opt)
  }
}
