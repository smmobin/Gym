/**
 * Structured workout plan table editor (trainer) + read-only renderer (athlete).
 */

/** @param {string} value */
function escapeHtml(value) {
  return String(value)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
}

/** @param {string} unit */
export function workoutUnitLabel(unit) {
  return unit === 'seconds' ? 'ثانیه' : 'تکرار'
}

/**
 * @param {any} item
 * @param {number} index
 */
export function formatWorkoutItemLine(item, index = 0) {
  const name = String(item?.exercise_name || '—').trim() || '—'
  const sets = Number(item?.sets) || 0
  const amount = Number(item?.amount) || 0
  const unit = workoutUnitLabel(item?.unit)
  const note = String(item?.note || '').trim()
  const base = `${index + 1}. ${name} · ${sets} ست · ${amount} ${unit}`
  return note ? `${base} · ${note}` : base
}

/**
 * @param {any[]} items
 * @param {{ legacyBody?: string, title?: string, meta?: string }} [opts]
 */
export function workoutPlanItemsTableHtml(items, opts = {}) {
  const rows = Array.isArray(items) ? items : []
  if (!rows.length) {
    const legacy = String(opts.legacyBody || '').trim()
    if (legacy) {
      return `<div class="workout-items-legacy">
        <p class="hint">برنامهٔ قدیمی (متن آزاد):</p>
        <p class="workout-items-legacy-body">${escapeHtml(legacy)}</p>
      </div>`
    }
    return `<p class="hint">حرکتی ثبت نشده.</p>`
  }
  const head = opts.title
    ? `<header class="workout-items-card-head">
        <h3 class="workout-items-card-title">${escapeHtml(opts.title)}</h3>
        ${opts.meta ? `<p class="hint workout-items-card-meta">${escapeHtml(opts.meta)}</p>` : ''}
      </header>`
    : ''
  return `<div class="workout-items-card">
    ${head}
    <div class="table-wrap workout-items-wrap">
      <table class="responsive-table workout-items-table">
        <thead>
          <tr>
            <th scope="col">#</th>
            <th scope="col">حرکت</th>
            <th scope="col">ست</th>
            <th scope="col">در هر ست</th>
            <th scope="col">واحد</th>
            <th scope="col">نکته</th>
          </tr>
        </thead>
        <tbody>
          ${rows
            .map(
              (it, i) => `<tr>
              <td data-label="#">${i + 1}</td>
              <td data-label="حرکت"><strong class="workout-item-name">${escapeHtml(it.exercise_name || '—')}</strong></td>
              <td data-label="ست">${escapeHtml(String(it.sets ?? '—'))}</td>
              <td data-label="در هر ست">${escapeHtml(String(it.amount ?? '—'))}</td>
              <td data-label="واحد"><span class="workout-item-unit">${escapeHtml(workoutUnitLabel(it.unit))}</span></td>
              <td data-label="نکته">${escapeHtml(it.note || '—')}</td>
            </tr>`,
            )
            .join('')}
        </tbody>
      </table>
    </div>
  </div>`
}

/**
 * @typedef {{
 *   exercise_id?: number | null,
 *   exercise_name: string,
 *   sets: number,
 *   amount: number,
 *   unit: 'reps' | 'seconds',
 *   note?: string | null,
 * }} WorkoutItemDraft
 */

/**
 * @param {HTMLElement} host
 * @param {{
 *   loadExercises: (q?: string) => Promise<Array<{ id: number, name: string }>>,
 *   createExercise?: (name: string) => Promise<{ id: number, name: string }>,
 *   initialItems?: WorkoutItemDraft[],
 * }} opts
 */
export function mountWorkoutPlanEditor(host, opts) {
  /** @type {Array<{ id: number, name: string }>} */
  let catalog = []
  /** @type {WorkoutItemDraft[]} */
  let rows =
    opts.initialItems && opts.initialItems.length
      ? opts.initialItems.map((r) => ({ ...r }))
      : [emptyRow()]

  host.classList.add('workout-plan-editor')
  host.innerHTML = `
    <div class="table-wrap workout-editor-wrap">
      <table class="responsive-table workout-editor-table">
        <thead>
          <tr>
            <th scope="col">#</th>
            <th scope="col">حرکت</th>
            <th scope="col">ست</th>
            <th scope="col">در هر ست</th>
            <th scope="col">واحد</th>
            <th scope="col">نکته</th>
            <th scope="col" class="workout-editor-actions-col"><span class="visually-hidden">عملیات</span></th>
          </tr>
        </thead>
        <tbody data-editor-body></tbody>
      </table>
    </div>
    <div class="inline-actions workout-editor-toolbar">
      <button type="button" class="btn ghost small" data-add-row>افزودن حرکت</button>
    </div>
  `

  const tbody = /** @type {HTMLElement} */ (host.querySelector('[data-editor-body]'))

  function emptyRow() {
    return {
      exercise_id: null,
      exercise_name: '',
      sets: 3,
      amount: 10,
      unit: /** @type {'reps'} */ ('reps'),
      note: '',
    }
  }

  async function refreshCatalog(q = '') {
    try {
      catalog = (await opts.loadExercises(q)) || []
    } catch {
      catalog = []
    }
  }

  /**
   * @param {HTMLElement} menu
   * @param {HTMLInputElement} input
   * @param {number} rowIndex
   */
  function renderExerciseMenu(menu, input, rowIndex) {
    const q = input.value.trim()
    const qKey = q.toLowerCase()
    const filtered = catalog.filter((c) => !qKey || c.name.toLowerCase().includes(qKey))
    menu.innerHTML = ''
    if (!filtered.length) {
      const empty = document.createElement('li')
      empty.className = 'custom-select-empty'
      empty.setAttribute('aria-disabled', 'true')
      empty.textContent = q
        ? `ثبت حرکت جدید: «${q}» — Enter`
        : 'هنوز حرکتی در کاتالوگ نیست — بنویسید و Enter بزنید'
      menu.appendChild(empty)
      return
    }
    filtered.forEach((c) => {
      const li = document.createElement('li')
      li.setAttribute('role', 'option')
      li.dataset.id = String(c.id)
      li.dataset.name = c.name
      li.textContent = c.name
      if (rows[rowIndex]?.exercise_id === c.id || rows[rowIndex]?.exercise_name === c.name) {
        li.setAttribute('aria-selected', 'true')
      }
      menu.appendChild(li)
    })
  }

  /**
   * @param {number} rowIndex
   * @param {HTMLElement} cell
   */
  function mountExerciseCombobox(rowIndex, cell) {
    cell.innerHTML = ''
    const root = document.createElement('div')
    root.className = 'custom-select custom-combobox is-block workout-exercise-combo'
    root.setAttribute('data-exercise-combo', '')

    const trigger = document.createElement('div')
    trigger.className = 'custom-select-trigger custom-combobox-trigger'
    trigger.setAttribute('role', 'combobox')
    trigger.setAttribute('aria-expanded', 'false')

    const input = document.createElement('input')
    input.type = 'text'
    input.className = 'custom-combobox-input'
    input.placeholder = 'جستجو یا نوشتن حرکت…'
    input.autocomplete = 'off'
    input.maxLength = 120
    input.required = true
    input.value = rows[rowIndex]?.exercise_name || ''

    const caret = document.createElement('button')
    caret.type = 'button'
    caret.className = 'custom-select-caret custom-combobox-caret'
    caret.setAttribute('aria-label', 'فهرست حرکات')
    caret.tabIndex = -1

    trigger.appendChild(input)
    trigger.appendChild(caret)

    const menu = document.createElement('ul')
    menu.className = 'custom-select-menu'
    menu.setAttribute('role', 'listbox')
    menu.hidden = true

    root.appendChild(trigger)
    root.appendChild(menu)
    cell.appendChild(root)

    function close() {
      root.classList.remove('is-open')
      trigger.setAttribute('aria-expanded', 'false')
      menu.hidden = true
    }

    async function open() {
      document.querySelectorAll('[data-exercise-combo].is-open').forEach((other) => {
        if (other === root) return
        other.classList.remove('is-open')
        const m = other.querySelector('.custom-select-menu')
        const t = other.querySelector('[aria-expanded]')
        if (m) /** @type {HTMLElement} */ (m).hidden = true
        if (t) t.setAttribute('aria-expanded', 'false')
      })
      await refreshCatalog(input.value)
      renderExerciseMenu(menu, input, rowIndex)
      root.classList.add('is-open')
      trigger.setAttribute('aria-expanded', 'true')
      menu.hidden = false
    }

    /**
     * @param {{ id?: number | null, name: string }} ex
     */
    function pick(ex) {
      rows[rowIndex].exercise_id = ex.id ?? null
      rows[rowIndex].exercise_name = ex.name
      input.value = ex.name
      close()
    }

    async function commitTyped() {
      const name = input.value.trim()
      if (!name) return
      const existing = catalog.find((c) => c.name.toLowerCase() === name.toLowerCase())
      if (existing) {
        pick(existing)
        return
      }
      if (opts.createExercise) {
        try {
          const created = await opts.createExercise(name)
          catalog = [...catalog.filter((c) => c.id !== created.id), created]
          pick(created)
          return
        } catch {
          /* fall through — keep local name for save-time create */
        }
      }
      pick({ id: null, name })
    }

    input.addEventListener('focus', () => {
      void open()
    })
    input.addEventListener('click', () => {
      if (!root.classList.contains('is-open')) void open()
    })
    input.addEventListener('input', () => {
      rows[rowIndex].exercise_name = input.value
      rows[rowIndex].exercise_id = null
      if (!root.classList.contains('is-open')) void open()
      else {
        void refreshCatalog(input.value).then(() => renderExerciseMenu(menu, input, rowIndex))
      }
    })
    input.addEventListener('keydown', (event) => {
      if (event.key === 'Enter') {
        event.preventDefault()
        void commitTyped()
      }
      if (event.key === 'Escape') {
        event.preventDefault()
        close()
      }
    })
    input.addEventListener('blur', () => {
      // Delay so menu click can fire first.
      setTimeout(() => {
        if (!root.contains(document.activeElement)) close()
      }, 120)
    })
    caret.addEventListener('mousedown', (event) => {
      event.preventDefault()
      if (root.classList.contains('is-open')) close()
      else {
        input.focus()
        void open()
      }
    })
    menu.addEventListener('mousedown', (event) => event.preventDefault())
    menu.addEventListener('click', (event) => {
      const option =
        event.target instanceof Element ? event.target.closest('[role="option"]') : null
      if (!option || !menu.contains(option)) return
      pick({
        id: option.getAttribute('data-id') ? Number(option.getAttribute('data-id')) : null,
        name: option.getAttribute('data-name') || option.textContent || '',
      })
    })
  }

  function paint() {
    tbody.innerHTML = ''
    rows.forEach((row, index) => {
      const tr = document.createElement('tr')
      tr.innerHTML = `
        <td data-label="#">${index + 1}</td>
        <td data-label="حرکت" data-ex-cell></td>
        <td data-label="ست"><input type="number" min="1" max="99" class="workout-editor-num" data-field="sets" value="${escapeHtml(String(row.sets))}" required /></td>
        <td data-label="در هر ست"><input type="number" min="1" max="9999" class="workout-editor-num" data-field="amount" value="${escapeHtml(String(row.amount))}" required /></td>
        <td data-label="واحد">
          <select data-field="unit" class="workout-editor-unit">
            <option value="reps"${row.unit !== 'seconds' ? ' selected' : ''}>تکرار</option>
            <option value="seconds"${row.unit === 'seconds' ? ' selected' : ''}>ثانیه</option>
          </select>
        </td>
        <td data-label="نکته"><input type="text" maxlength="240" class="workout-editor-note" data-field="note" value="${escapeHtml(row.note || '')}" placeholder="اختیاری" /></td>
        <td data-label="عملیات" class="workout-editor-actions-col">
          <button type="button" class="btn small ghost" data-remove-row ${rows.length <= 1 ? 'disabled' : ''}>حذف</button>
        </td>
      `
      const exCell = /** @type {HTMLElement} */ (tr.querySelector('[data-ex-cell]'))
      mountExerciseCombobox(index, exCell)

      tr.querySelectorAll('[data-field]').forEach((el) => {
        el.addEventListener('change', () => syncRow(index, tr))
        el.addEventListener('input', () => syncRow(index, tr))
      })
      tr.querySelector('[data-remove-row]')?.addEventListener('click', () => {
        if (rows.length <= 1) return
        rows.splice(index, 1)
        paint()
      })
      tbody.appendChild(tr)
    })
  }

  /**
   * @param {number} index
   * @param {HTMLElement} tr
   */
  function syncRow(index, tr) {
    const setsEl = /** @type {HTMLInputElement | null} */ (tr.querySelector('[data-field="sets"]'))
    const amountEl = /** @type {HTMLInputElement | null} */ (
      tr.querySelector('[data-field="amount"]')
    )
    const unitEl = /** @type {HTMLSelectElement | null} */ (tr.querySelector('[data-field="unit"]'))
    const noteEl = /** @type {HTMLInputElement | null} */ (tr.querySelector('[data-field="note"]'))
    if (!rows[index]) return
    rows[index].sets = Math.max(1, Number(setsEl?.value) || 1)
    rows[index].amount = Math.max(1, Number(amountEl?.value) || 1)
    rows[index].unit = unitEl?.value === 'seconds' ? 'seconds' : 'reps'
    rows[index].note = noteEl?.value || ''
  }

  host.querySelector('[data-add-row]')?.addEventListener('click', () => {
    rows.push(emptyRow())
    paint()
  })

  void refreshCatalog('').then(() => paint())

  return {
    /** @returns {WorkoutItemDraft[]} */
    getItems() {
      return rows
        .map((r) => ({
          exercise_id: r.exercise_id ?? null,
          exercise_name: String(r.exercise_name || '').trim(),
          sets: Math.max(1, Number(r.sets) || 1),
          amount: Math.max(1, Number(r.amount) || 1),
          unit: r.unit === 'seconds' ? /** @type {'seconds'} */ ('seconds') : /** @type {'reps'} */ ('reps'),
          note: String(r.note || '').trim() || null,
        }))
        .filter((r) => r.exercise_name)
    },
    /** @param {WorkoutItemDraft[]} next */
    setItems(next) {
      rows =
        next && next.length
          ? next.map((r) => ({
              exercise_id: r.exercise_id ?? null,
              exercise_name: r.exercise_name || '',
              sets: r.sets || 3,
              amount: r.amount || 10,
              unit: r.unit === 'seconds' ? 'seconds' : 'reps',
              note: r.note || '',
            }))
          : [emptyRow()]
      paint()
    },
    reset() {
      rows = [emptyRow()]
      paint()
    },
  }
}
