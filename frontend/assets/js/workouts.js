import { ApiError, apiGet, apiPatch, apiPost } from './api.js'
import { formatDateTime } from './format.js'
import { bindMemberSearch, personSelectRowHtml, setPersonChip } from './members.js'
import { setStatus } from './ui.js'

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
            const body = String(p.body || '')
            const preview = body.slice(0, 140) + (body.length > 140 ? '…' : '')
            const when = formatDateTime(p.updated_at || p.created_at)
            return `<tr class="workout-plan-row" data-plan-id="${escapeHtml(String(p.id))}">
              <td data-label="عنوان">
                <strong class="workout-plan-title">${escapeHtml(p.title || '—')}</strong>
              </td>
              <td data-label="خلاصه برنامه">
                <p class="workout-plan-preview">${escapeHtml(preview || '—')}</p>
              </td>
              <td data-label="مربی">
                <span class="workout-plan-trainer">${escapeHtml(p.trainer_full_name || '—')}</span>
              </td>
              <td data-label="به‌روزرسانی">
                <time class="workout-plan-when">${escapeHtml(when)}</time>
              </td>
              ${
                canWrite
                  ? `<td data-label="عملیات" class="workout-plans-actions-col">
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
          ? `<form data-form class="form-grid" style="margin-top:1rem">
        <input type="hidden" name="id" />
        <label class="full">عنوان<input name="title" required /></label>
        <label class="full">متن برنامه<textarea name="body" rows="6" required></textarea></label>
        <div class="inline-actions">
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
        form.querySelector('[name=body]').value = p.body || ''
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
    if (!member) return
    const fd = new FormData(e.target)
    const id = String(fd.get('id') || '')
    const body = { title: String(fd.get('title')).trim(), body: String(fd.get('body')).trim() }
    try {
      if (id) await apiPatch(`/api/v1/workout-plans/${id}`, body)
      else await apiPost(`/api/v1/members/${member.id}/workout-plans`, body)
      setStatus(status, 'ذخیره شد.', 'ok')
      e.target.reset()
      e.target.querySelector('[name=id]').value = ''
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
  })
}
