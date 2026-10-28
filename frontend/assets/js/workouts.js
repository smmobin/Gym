import { ApiError, apiGet, apiPatch, apiPost } from './api.js'
import { formatDateTime } from './format.js'
import { bindMemberSearch, personSelectRowHtml, setPersonChip } from './members.js'
import { setStatus } from './ui.js'

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
      <div class="list" data-plans></div>
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

  async function loadPlans() {
    if (!member) return
    const data = await apiGet(`/api/v1/members/${member.id}/workout-plans`)
    const items = data.items || []
    root.querySelector('[data-plans]').innerHTML = items.length
      ? items
          .map(
            (p) => `<div class="row-item"><div>
          <h3>${p.title}</h3>
          <p>${(p.body || '').slice(0, 120)}${(p.body || '').length > 120 ? '…' : ''}</p>
          <p class="hint">${p.trainer_full_name || '—'} · ${formatDateTime(p.updated_at || p.created_at)}</p>
        </div>
        ${canWrite ? `<button type="button" class="btn small ghost" data-edit='${JSON.stringify({ id: p.id, title: p.title, body: p.body })}'>ویرایش</button>` : ''}
        </div>`,
          )
          .join('')
      : '<p class="hint">برنامه‌ای نیست.</p>'
    root.querySelectorAll('[data-edit]').forEach((btn) => {
      btn.addEventListener('click', () => {
        const raw = btn.getAttribute('data-edit')
        if (!raw) return
        const p = JSON.parse(raw)
        const form = root.querySelector('[data-form]')
        if (!form) return
        form.querySelector('[name=id]').value = String(p.id)
        form.querySelector('[name=title]').value = p.title
        form.querySelector('[name=body]').value = p.body || ''
      })
    })
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
