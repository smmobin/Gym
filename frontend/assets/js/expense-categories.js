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
 * @param {string} query
 * @param {Array<{ value: string, label: string }>} categories
 */
export function filterExpenseCategories(query, categories) {
  const q = String(query || '')
    .trim()
    .toLowerCase()
  if (!q) return [...categories]
  return categories.filter((c) => {
    const label = c.label.toLowerCase()
    const value = c.value.toLowerCase()
    return label.includes(q) || value.includes(q)
  })
}

/**
 * Single-field combobox: type or pick from Ocean-styled dropdown (no second field).
 * Host should be an empty container (e.g. inside a <label>).
 *
 * @param {HTMLElement} host
 * @param {{
 *   name?: string,
 *   categories?: Array<{ value: string, label: string }>,
 *   placeholder?: string,
 *   required?: boolean,
 *   maxlength?: number,
 * }} [opts]
 */
export function mountExpenseCategoryCombobox(host, opts = {}) {
  const name = opts.name || 'category'
  const placeholder = opts.placeholder || 'انتخاب یا نوشتن دسته…'
  const required = opts.required !== false
  const maxlength = opts.maxlength ?? 32
  /** @type {Array<{ value: string, label: string }>} */
  let categories = opts.categories ? [...opts.categories] : mergeExpenseCategories()
  /** @type {string} */
  let activeValue = ''

  host.innerHTML = ''
  const root = document.createElement('div')
  root.className = 'custom-select custom-combobox is-block'
  root.setAttribute('data-expense-combobox', '')

  const trigger = document.createElement('div')
  trigger.className = 'custom-select-trigger custom-combobox-trigger'
  trigger.setAttribute('role', 'combobox')
  trigger.setAttribute('aria-haspopup', 'listbox')
  trigger.setAttribute('aria-expanded', 'false')

  const input = document.createElement('input')
  input.type = 'text'
  input.name = name
  input.className = 'custom-combobox-input'
  input.placeholder = placeholder
  input.autocomplete = 'off'
  input.maxLength = maxlength
  input.required = required
  input.setAttribute('aria-autocomplete', 'list')

  const caret = document.createElement('button')
  caret.type = 'button'
  caret.className = 'custom-select-caret custom-combobox-caret'
  caret.setAttribute('aria-label', 'باز کردن فهرست دسته‌ها')
  caret.tabIndex = -1

  trigger.appendChild(input)
  trigger.appendChild(caret)

  const menu = document.createElement('ul')
  menu.className = 'custom-select-menu'
  menu.setAttribute('role', 'listbox')
  menu.hidden = true

  root.appendChild(trigger)
  root.appendChild(menu)
  host.appendChild(root)

  function closeOthers() {
    document.querySelectorAll('[data-custom-select].is-open, [data-expense-combobox].is-open').forEach(
      (other) => {
        if (other === root) return
        other.classList.remove('is-open')
        const otherMenu = other.querySelector('.custom-select-menu')
        const otherTrigger = other.querySelector(
          '.custom-select-trigger, [aria-expanded]',
        )
        if (otherMenu) otherMenu.hidden = true
        if (otherTrigger) otherTrigger.setAttribute('aria-expanded', 'false')
      },
    )
    document.querySelectorAll('[data-time-picker].is-open, [data-date-picker].is-open').forEach((tp) => {
      tp.classList.remove('is-open')
      const pop = tp.querySelector('.time-picker-pop, .date-picker-pop')
      if (pop) pop.hidden = true
    })
  }

  function close() {
    root.classList.remove('is-open')
    trigger.setAttribute('aria-expanded', 'false')
    menu.hidden = true
  }

  function open() {
    closeOthers()
    renderMenu(input.value)
    root.classList.add('is-open')
    trigger.setAttribute('aria-expanded', 'true')
    menu.hidden = false
  }

  /**
   * @param {string} query
   */
  function renderMenu(query) {
    const filtered = filterExpenseCategories(query, categories)
    menu.innerHTML = ''
    if (!filtered.length) {
      const empty = document.createElement('li')
      empty.className = 'custom-select-empty'
      empty.setAttribute('aria-disabled', 'true')
      const typed = String(query || '').trim()
      empty.textContent = typed
        ? `ثبت به‌عنوان دستهٔ جدید: «${typed}»`
        : 'موردی نیست'
      menu.appendChild(empty)
      return
    }
    filtered.forEach((c) => {
      const item = document.createElement('li')
      item.setAttribute('role', 'option')
      item.tabIndex = -1
      item.dataset.value = c.value
      item.dataset.label = c.label
      item.textContent = c.label
      const selected =
        activeValue === c.value ||
        input.value.trim() === c.label ||
        input.value.trim() === c.value
      item.setAttribute('aria-selected', selected ? 'true' : 'false')
      menu.appendChild(item)
    })
  }

  /**
   * @param {{ value: string, label: string }} cat
   */
  function pick(cat) {
    activeValue = cat.value
    input.value = cat.label
    close()
    input.dispatchEvent(new Event('input', { bubbles: true }))
    input.dispatchEvent(new Event('change', { bubbles: true }))
    input.focus()
  }

  input.addEventListener('focus', () => {
    open()
  })
  // After pick we keep focus; click must re-open without requiring an outside blur first.
  input.addEventListener('click', () => {
    if (!root.classList.contains('is-open')) open()
  })

  input.addEventListener('input', () => {
    activeValue = ''
    if (!root.classList.contains('is-open')) open()
    else renderMenu(input.value)
  })

  caret.addEventListener('mousedown', (event) => {
    event.preventDefault()
    if (root.classList.contains('is-open')) {
      close()
    } else {
      input.focus()
      open()
    }
  })

  menu.addEventListener('mousedown', (event) => {
    // Keep focus in input while clicking options
    event.preventDefault()
  })

  menu.addEventListener('click', (event) => {
    const option = /** @type {HTMLElement | null} */ (
      event.target instanceof Element ? event.target.closest('[role="option"]') : null
    )
    if (!option || !menu.contains(option)) return
    pick({
      value: option.dataset.value || '',
      label: option.dataset.label || option.textContent || '',
    })
  })

  input.addEventListener('keydown', (event) => {
    const options = /** @type {HTMLElement[]} */ (
      [...menu.querySelectorAll('[role="option"]')]
    )
    const current = document.activeElement instanceof HTMLElement ? document.activeElement : null
    const index = options.indexOf(/** @type {HTMLElement} */ (current))

    if (event.key === 'Escape') {
      event.preventDefault()
      close()
      return
    }
    if (event.key === 'ArrowDown') {
      event.preventDefault()
      if (!root.classList.contains('is-open')) open()
      if (!options.length) return
      const next = options[Math.min(Math.max(index, -1) + 1, options.length - 1)]
      next.focus()
      return
    }
    if (event.key === 'ArrowUp') {
      event.preventDefault()
      if (!options.length) return
      const prev = options[Math.max(index - 1, 0)]
      prev.focus()
      return
    }
    if (event.key === 'Enter') {
      if (root.classList.contains('is-open') && current?.getAttribute('role') === 'option') {
        event.preventDefault()
        pick({
          value: current.dataset.value || '',
          label: current.dataset.label || current.textContent || '',
        })
      } else {
        close()
      }
    }
  })

  menu.addEventListener('keydown', (event) => {
    if (event.key === 'Escape') {
      event.preventDefault()
      close()
      input.focus()
    }
  })

  const onDocClick = (event) => {
    if (!root.classList.contains('is-open')) return
    if (event.target instanceof Node && root.contains(event.target)) return
    close()
  }
  document.addEventListener('click', onDocClick)

  return {
    /** @param {Array<{ value: string, label: string }>} next */
    setCategories(next) {
      categories = [...next]
      if (root.classList.contains('is-open')) renderMenu(input.value)
    },
    getRawValue() {
      return input.value
    },
    clear() {
      activeValue = ''
      input.value = ''
      close()
    },
    destroy() {
      document.removeEventListener('click', onDocClick)
      host.innerHTML = ''
    },
  }
}
