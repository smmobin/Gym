import { ApiError, apiGet, apiPatch, apiPost } from './api.js'
import { formatDateTime } from './format.js'
import { bindMemberSearch, personSelectRowHtml, setPersonChip } from './members.js'
import { setStatus } from './ui.js'
import { mountWorkoutPlanEditor, workoutPlanPreviewHtml } from './workout-plan-editor.js'

/** @param {string} value */
function escapeHtml(value) {
  return String(value)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
}

/**
 * @param {any[]} items
 * @param {{ canWrite?: boolean }} [opts]
 */
export function workoutPlansTableHtml(items, opts = {}) {
  const canWrite = !!opts.canWrite
  if (!items.length) {
    return `<div class="workout-plans-empty" data-plans-empty>
      <p class="hint">هنوز برنامه‌ای برای این شاگرد ثبت نشده.</p>
    </div>`
  }
  return `<div class="table-wrap workout-plans-wrap">
    <table class="responsive-table workout-plans-table">
      <thead>
        <tr>
          <th scope="col">عنوان</th>
          <th scope="col">خلاصه برنامه</th>
          <th scope="col">مربی</th>
          <th scope="col">به‌روزرسانی</th>
          ${canWrite ? '<th scope="col" class="workout-plans-actions-col">عملیات</th>' : ''}
        </tr>
      </thead>
      <tbody>
        ${items
          .map((p) => {
            const planItems = Array.isArray(p.items) ? p.items : []
            const preview = workoutPlanPreviewHtml(planItems, { legacyBody: p.body || '' })
            const when = formatDateTime(p.updated_at || p.created_at)
            return `<tr class="workout-plan-row" data-plan-id="${escapeHtml(String(p.id))}">
              <td data-label="عنوان" class="workout-plan-cell-title">
                <strong class="workout-plan-title">${escapeHtml(p.title || '—')}</strong>
              </td>
              <td data-label="خلاصه برنامه" class="workout-plan-cell-preview">
                ${preview}
              </td>
              <td data-label="مربی" class="workout-plan-cell-trainer">
                <span class="workout-plan-trainer">${escapeHtml(p.trainer_full_name || '—')}</span>
              </td>
              <td data-label="به‌روزرسانی" class="workout-plan-cell-when">
                <time class="workout-plan-when">${escapeHtml(when)}</time>
              </td>
              ${
                canWrite
                  ? `<td data-label="عملیات" class="workout-plans-actions-col workout-plan-cell-actions">
                      <button type="button" class="btn small ghost" data-edit-plan="${escapeHtml(String(p.id))}">ویرایش</button>
                    </td>`
                  : ''
              }
            </tr>`
          })
          .join('')}
      </tbody>
    </table>
  </div>`
}

/** @param {HTMLElement} root @param {{ role: string }} user */
export function mountWorkouts(root, user) {
  const canWrite = user.role === 'manager' || user.role === 'trainer'
  root.innerHTML = `
    <article class="panel">
      <header class="panel-head"><h2>برنامه تمرینی</h2></header>
      <div class="status-msg" data-status hidden></div>
      ${personSelectRowHtml({
        label: 'جستجوی شاگرد',
        chipAttr: 'data-sel',
        emptyText: 'عضوی انتخاب نشده',
      })}
      <div class="workout-plans-host" data-plans></div>
      ${
        canWrite
          ? `<form data-form class="form-grid workout-plan-form" style="margin-top:1rem">
        <input type="hidden" name="id" />
        <label class="full">عنوان برنامه<input name="title" required maxlength="160" placeholder="مثلاً برنامه هفته ۱" /></label>
        <div class="full">
          <p class="person-select-label workout-editor-label">جدول حرکات</p>
          <div data-editor-host></div>
        </div>
        <div class="inline-actions full">
          <button class="btn" type="submit">ذخیره</button>
          <button class="btn ghost" type="button" data-reset>جدید</button>
        </div>
      </form>`
          : '<p class="hint">منشی فقط خواندن دارد.</p>'
      }
    </article>
  `
  const status = root.querySelector('[data-status]')
  /** @type {any | null} */ let member = null
  /** @type {Map<string, any>} */
  const plansById = new Map()

  /** @type {ReturnType<typeof mountWorkoutPlanEditor> | null} */
  let editor = null
  if (canWrite) {
    const host = /** @type {HTMLElement | null} */ (root.querySelector('[data-editor-host]'))
    if (host) {
      editor = mountWorkoutPlanEditor(host, {
        async loadExercises(q = '') {
          const qs = q.trim() ? `?q=${encodeURIComponent(q.trim())}` : ''
          const data = await apiGet(`/api/v1/workout-exercises${qs}`)
          return data.items || []
        },
        async createExercise(name) {
          return apiPost('/api/v1/workout-exercises', { name })
        },
      })
    }
  }

  function bindEditButtons() {
    root.querySelectorAll('[data-edit-plan]').forEach((btn) => {
      btn.addEventListener('click', () => {
        const id = btn.getAttribute('data-edit-plan')
        if (!id) return
        const p = plansById.get(id)
        const form = root.querySelector('[data-form]')
        if (!p || !form) return
        form.querySelector('[name=id]').value = String(p.id)
        form.querySelector('[name=title]').value = p.title || ''
        const items = Array.isArray(p.items) ? p.items : []
        editor?.setItems(
          items.length
            ? items
            : p.body
              ? [
                  {
                    exercise_name: String(p.body).slice(0, 120),
                    sets: 1,
                    amount: 1,
                    unit: 'reps',
                    note: 'از برنامهٔ متنی قبلی',
                  },
                ]
              : [],
        )
      })
    })
  }

  async function loadPlans() {
    if (!member) return
    const data = await apiGet(`/api/v1/members/${member.id}/workout-plans`)
    const items = data.items || []
    plansById.clear()
    for (const p of items) plansById.set(String(p.id), p)
    const host = root.querySelector('[data-plans]')
    if (host) host.innerHTML = workoutPlansTableHtml(items, { canWrite })
    bindEditButtons()
  }

  bindMemberSearch(
    root.querySelector('[data-pick]'),
    root.querySelector('[data-q]'),
    async (m) => {
      member = m
      setPersonChip(root.querySelector('[data-sel]'), m)
      try {
        await loadPlans()
      } catch (err) {
        setStatus(status, err instanceof ApiError ? err.message : 'خطا', 'error')
      }
    },
  )

  root.querySelector('[data-form]')?.addEventListener('submit', async (e) => {
    e.preventDefault()
    if (!member || !editor) return
    const fd = new FormData(e.target)
    const id = String(fd.get('id') || '')
    const title = String(fd.get('title') || '').trim()
    const items = editor.getItems()
    if (!items.length) {
      setStatus(status, 'حداقل یک حرکت با نام وارد کنید.', 'error')
      return
    }
    const payload = { title, items }
    try {
      if (id) await apiPatch(`/api/v1/workout-plans/${id}`, payload)
      else await apiPost(`/api/v1/members/${member.id}/workout-plans`, payload)
      setStatus(status, 'ذخیره شد.', 'ok')
      e.target.reset()
      e.target.querySelector('[name=id]').value = ''
      editor.reset()
      await loadPlans()
    } catch (err) {
      setStatus(status, err instanceof ApiError ? err.message : 'ذخیره ناموفق', 'error')
    }
  })
  root.querySelector('[data-reset]')?.addEventListener('click', () => {
    const form = root.querySelector('[data-form]')
    form?.reset()
    const id = form?.querySelector('[name=id]')
    if (id) id.value = ''
    editor?.reset()
  })
}
