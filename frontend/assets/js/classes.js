import { ApiError, apiErrorMessage, apiGet, apiPatch, apiPost } from './api.js'
import { createAutoRefresh } from './auto-refresh.js'
import { formatDateTimeShort, genderLabelFa } from './format.js'
import { emitLive, LIVE } from './live-data.js'
import { bindMemberSearch, personSelectRowHtml, setPersonChip } from './members.js'
import { createListPager } from './pagination.js'
import { setStatus } from './ui.js'

/** @param {HTMLElement} root @param {{ role: string }} user */
export function mountClasses(root, user) {
  const canWrite = user.role === 'manager' || user.role === 'receptionist'
  root.innerHTML = `
    <article class="panel">
      <header class="panel-head"><h2>کلاس‌های گروهی</h2></header>
      <div class="status-msg" data-status hidden></div>
      <div class="table-wrap"><table class="responsive-table">
        <thead><tr><th>عنوان</th><th>زمان</th><th>ظرفیت</th><th>جنسیت</th><th></th></tr></thead>
        <tbody data-tbody></tbody>
      </table></div>
      <div data-pager class="list-pager-host" hidden></div>
    </article>
    <div class="grid-2" style="margin-top:1rem">
      <article class="panel">
        <header class="panel-head"><h2>رزروهای کلاس انتخاب‌شده</h2></header>
        <p class="hint" data-sel>کلاسی انتخاب نشده</p>
        <div class="list" data-bookings></div>
        ${
          canWrite
            ? `${personSelectRowHtml({
                label: 'جستجوی عضو',
                inputAttr: 'data-mq',
                pickAttr: 'data-mpick',
                chipAttr: 'data-member-sel',
                emptyText: 'عضوی انتخاب نشده',
              })}
               <button type="button" class="btn" data-book style="margin-top:0.75rem">رزرو</button>`
            : ''
        }
      </article>
      ${
        canWrite
          ? `<article class="panel">
        <header class="panel-head"><h2>ساخت / ویرایش کلاس</h2></header>
        <form data-class-form class="form-grid">
          <input type="hidden" name="id" />
          <label class="full">عنوان<input name="title" required /></label>
          <label>ظرفیت<input name="capacity" type="number" min="1" value="12" required /></label>
          <label>برچسب جنسیت
            <select name="gender_label" required>
              <option value="mixed">مختلط</option>
              <option value="women">بانوان</option>
              <option value="men">آقایان</option>
            </select>
          </label>
          <label>شروع<input name="starts_at" type="datetime-local" required /></label>
          <label>پایان<input name="ends_at" type="datetime-local" required /></label>
          <div class="inline-actions">
            <button class="btn" type="submit">ذخیره</button>
            <button class="btn ghost" type="button" data-reset>جدید</button>
          </div>
        </form>
      </article>`
          : ''
      }
    </div>
  `
  const status = root.querySelector('[data-status]')
  const pager = createListPager(root.querySelector('[data-pager]'))
  /** @type {any[]} */ let classes = []
  /** @type {any | null} */ let selected = null
  /** @type {any | null} */ let pickMember = null

  function paintClassRows(rows) {
    const tbody = root.querySelector('[data-tbody]')
    if (!tbody) return
    tbody.innerHTML = rows
      .map(
        (c) => `<tr>
          <td data-label="عنوان">${c.title}${c.trainer_schedule_conflict ? ' ⚠' : ''}</td>
          <td data-label="زمان">${formatDateTimeShort(c.starts_at)}</td>
          <td data-label="ظرفیت">${(c.booked_count ?? 0).toLocaleString('fa-IR')} / ${(c.capacity ?? 0).toLocaleString('fa-IR')} (باقی ${c.remaining})</td>
          <td data-label="جنسیت">${genderLabelFa(c.gender_label)}</td>
          <td><button type="button" class="btn small" data-id="${c.id}">انتخاب</button>
          ${canWrite ? `<button type="button" class="btn small ghost" data-edit="${c.id}">ویرایش</button>` : ''}
          ${
            canWrite && c.is_active !== false && !(c.booked_count > 0)
              ? `<button type="button" class="btn small ghost" data-deactivate="${c.id}">غیرفعال‌سازی</button>`
              : ''
          }</td>
        </tr>`,
      )
      .join('')
    tbody.querySelectorAll('[data-id]').forEach((b) =>
      b.addEventListener('click', () => void selectClass(Number(b.getAttribute('data-id')))),
    )
    tbody.querySelectorAll('[data-edit]').forEach((b) =>
      b.addEventListener('click', () => fillEdit(Number(b.getAttribute('data-edit')))),
    )
    tbody.querySelectorAll('[data-deactivate]').forEach((b) =>
      b.addEventListener('click', () => void deactivateClass(Number(b.getAttribute('data-deactivate')))),
    )
  }

  /** @param {number} id */
  async function deactivateClass(id) {
    const c = classes.find((x) => x.id === id)
    if (!c) return
    if ((c.booked_count ?? 0) > 0) {
      setStatus(status, 'کلاس دارای رزرو فعال را نمی‌توان غیرفعال کرد.', 'error')
      return
    }
    if (!confirm(`کلاس «${c.title}» غیرفعال شود؟`)) return
    try {
      await apiPatch(`/api/v1/group-classes/${id}`, { is_active: false })
      setStatus(status, 'کلاس غیرفعال شد.', 'ok')
      if (selected?.id === id) {
        selected = null
        root.querySelector('[data-sel]').textContent = 'کلاسی انتخاب نشده'
        root.querySelector('[data-bookings]').innerHTML = ''
      }
      const form = root.querySelector('[data-class-form]')
      const idInput = form?.querySelector('[name=id]')
      if (idInput instanceof HTMLInputElement && idInput.value === String(id)) {
        form?.reset()
        if (idInput) idInput.value = ''
        if (form) syncGenderSelect(form)
      }
      emitLive(LIVE.CLASSES)
      await autoRefresh.refresh()
    } catch (err) {
      setStatus(status, apiErrorMessage(err, 'غیرفعال‌سازی ناموفق'), 'error')
    }
  }

  /**
   * @param {{ silent?: boolean, focusId?: unknown }} [ctx]
   */
  async function load(ctx = {}) {
    const silent = !!ctx.silent
    const focusId = ctx.focusId != null && ctx.focusId !== '' ? Number(ctx.focusId) : null
    if (!silent) setStatus(status, 'بارگذاری…', 'loading')
    try {
      const data = await apiGet('/api/v1/group-classes')
      // Always replace local list then paint so DOM matches fresh API data (BUG-008).
      classes = Array.isArray(data.items) ? data.items : []
      if (focusId != null && Number.isFinite(focusId)) {
        pager.goToMatching(classes, paintClassRows, (c) => Number(c.id) === focusId)
      } else if (!silent) {
        pager.reset()
        pager.paint(classes, paintClassRows)
      } else {
        pager.paint(classes, paintClassRows)
      }
      setStatus(status, `${classes.length.toLocaleString('fa-IR')} کلاس`, 'ok')
    } catch (err) {
      setStatus(status, apiErrorMessage(err, 'بارگذاری ناموفق — تلاش مجدد خودکار…'), 'error')
      throw err
    }
  }

  const autoRefresh = createAutoRefresh(root, load, {
    intervalMs: 15_000,
    retryBaseMs: 2_500,
    retryMaxMs: 45_000,
    events: [LIVE.CLASSES],
  })

  function fillEdit(id) {
    const c = classes.find((x) => x.id === id)
    if (!c) return
    const form = root.querySelector('[data-class-form]')
    if (!form) return
    form.querySelector('[name=id]').value = String(c.id)
    form.querySelector('[name=title]').value = c.title
    form.querySelector('[name=capacity]').value = String(c.capacity)
    const genderSel = form.querySelector('[name=gender_label]')
    if (genderSel instanceof HTMLSelectElement) {
      genderSel.value = c.gender_label || 'mixed'
      globalThis.GymCustomSelect?.sync?.(genderSel)
    }
    form.querySelector('[name=starts_at]').value = toLocalInput(c.starts_at)
    form.querySelector('[name=ends_at]').value = toLocalInput(c.ends_at)
  }

  async function selectClass(id) {
    selected = classes.find((c) => c.id === id) || null
    root.querySelector('[data-sel]').textContent = selected
      ? `${selected.title} · باقی ${selected.remaining}`
      : 'کلاسی انتخاب نشده'
    try {
      const data = await apiGet(`/api/v1/group-classes/${id}/bookings`)
      const items = data.items || []
      const started = selected && new Date(selected.starts_at) <= new Date()
      root.querySelector('[data-bookings]').innerHTML = items.length
        ? items
            .map(
              (b) => `<div class="row-item"><div>
            <h3>${b.member_name || b.member_display_id}</h3>
            <p>${b.status}</p></div>
            <div class="inline-actions">
              ${canWrite && b.status === 'booked' ? `<button type="button" class="btn small ghost" data-cancel="${b.id}">لغو</button>` : ''}
              ${canWrite && b.status === 'booked' && started ? `
                <button type="button" class="btn small" data-att="${b.id}">حاضر</button>
                <button type="button" class="btn small ghost" data-ns="${b.id}">غیبت</button>` : ''}
            </div></div>`,
            )
            .join('')
        : '<p class="hint">رزروی نیست.</p>'
      root.querySelectorAll('[data-cancel]').forEach((btn) =>
        btn.addEventListener('click', async () => {
          await apiPost(`/api/v1/group-classes/${id}/bookings/${btn.getAttribute('data-cancel')}/cancel`)
          setStatus(status, 'لغو شد.', 'ok')
          emitLive(LIVE.CLASSES, { focusId: id })
          await autoRefresh.refresh({ focusId: id })
          await selectClass(id)
        }),
      )
      const outcome = async (bookingId, kind, membershipId) => {
        const path =
          kind === 'no-show'
            ? `/api/v1/group-classes/${id}/bookings/${bookingId}/no-show`
            : `/api/v1/group-classes/${id}/bookings/${bookingId}/attended`
        try {
          const body = membershipId ? { membership_id: membershipId } : {}
          await apiPost(path, body)
          setStatus(status, kind === 'no-show' ? 'غیبت ثبت شد.' : 'حضور ثبت شد.', 'ok')
          emitLive(LIVE.CLASSES, { focusId: id })
          await autoRefresh.refresh({ focusId: id })
          await selectClass(id)
        } catch (err) {
          if (err instanceof ApiError && err.detail && err.detail.code === 'membership_required') {
            const opts = err.detail.options || []
            const pick = opts[0]?.id
            if (pick && confirm(`${err.message}\nبا عضویت #${pick} ادامه؟`)) {
              await outcome(bookingId, kind, pick)
            } else setStatus(status, err.message, 'error')
          } else setStatus(status, err instanceof ApiError ? err.message : 'خطا', 'error')
        }
      }
      root.querySelectorAll('[data-att]').forEach((btn) =>
        btn.addEventListener('click', () => void outcome(btn.getAttribute('data-att'), 'attended')),
      )
      root.querySelectorAll('[data-ns]').forEach((btn) =>
        btn.addEventListener('click', () => void outcome(btn.getAttribute('data-ns'), 'no-show')),
      )
    } catch (err) {
      setStatus(status, err instanceof ApiError ? err.message : 'خطا', 'error')
    }
  }

  if (canWrite) {
    bindMemberSearch(
      (root.querySelector('[data-mpick]')),
      (root.querySelector('[data-mq]')),
      (m) => {
        pickMember = m
        setPersonChip(root.querySelector('[data-member-sel]'), m)
      },
    )
    root.querySelector('[data-book]')?.addEventListener('click', async () => {
      if (!selected || !pickMember) {
        setStatus(status, 'کلاس و عضو را انتخاب کنید.', 'error')
        return
      }
      try {
        await apiPost(`/api/v1/group-classes/${selected.id}/bookings`, { member_id: pickMember.id })
        setStatus(status, 'رزرو ثبت شد.', 'ok')
        emitLive(LIVE.CLASSES, { focusId: selected.id })
        await autoRefresh.refresh({ focusId: selected.id })
        await selectClass(selected.id)
      } catch (err) {
        setStatus(status, err instanceof ApiError ? err.message : 'رزرو ناموفق', 'error')
      }
    })
    root.querySelector('[data-class-form]')?.addEventListener('submit', async (e) => {
      e.preventDefault()
      const form = /** @type {HTMLFormElement} */ (e.target)
      // BUG-007: prevent double-create from rapid/repeated Save before id is set.
      if (form.dataset.busy === '1') return
      form.dataset.busy = '1'
      const submitBtn = /** @type {HTMLButtonElement | null} */ (form.querySelector('[type="submit"]'))
      if (submitBtn) submitBtn.disabled = true
      const fd = new FormData(form)
      const id = String(fd.get('id') || '')
      const body = {
        title: String(fd.get('title')).trim(),
        capacity: Number(fd.get('capacity')),
        gender_label: String(fd.get('gender_label') || 'mixed').trim() || 'mixed',
        starts_at: new Date(String(fd.get('starts_at'))).toISOString(),
        ends_at: new Date(String(fd.get('ends_at'))).toISOString(),
      }
      let savedOk = false
      /** @type {number | null} */
      let focusId = null
      try {
        const data = id
          ? await apiPatch(`/api/v1/group-classes/${id}`, body)
          : await apiPost('/api/v1/group-classes', body)
        const saved = data?.group_class
        // Keep form filled and set id so the next Save is PATCH, not another POST.
        if (saved?.id != null) {
          const idInput = form.querySelector('[name=id]')
          if (idInput instanceof HTMLInputElement) idInput.value = String(saved.id)
          focusId = Number(saved.id)
        } else if (id) {
          focusId = Number(id)
        }
        if (data.trainer_schedule_conflict || data.warning) {
          setStatus(status, data.warning || 'هشدار تداخل زمان مربی — کلاس ذخیره شد.', 'ok')
        } else setStatus(status, 'کلاس ذخیره شد.', 'ok')
        savedOk = true
      } catch (err) {
        setStatus(status, apiErrorMessage(err, 'ذخیره ناموفق'), 'error')
      } finally {
        form.dataset.busy = '0'
        if (submitBtn) submitBtn.disabled = false
      }
      if (savedOk) {
        const liveDetail = focusId != null ? { focusId } : {}
        emitLive(LIVE.CLASSES, liveDetail)
        await autoRefresh.refresh(liveDetail)
      }
    })
    root.querySelector('[data-reset]')?.addEventListener('click', () => {
      const form = root.querySelector('[data-class-form]')
      form?.reset()
      const id = form?.querySelector('[name=id]')
      if (id) id.value = ''
      if (form) syncGenderSelect(form)
    })
    globalThis.GymCustomSelect?.refresh?.(root)
  }
}

/** @param {ParentNode} scope */
function syncGenderSelect(scope) {
  const genderSel = scope.querySelector('[name=gender_label]')
  if (genderSel instanceof HTMLSelectElement) {
    if (!genderSel.value) genderSel.value = 'mixed'
    globalThis.GymCustomSelect?.sync?.(genderSel)
  }
}

function toLocalInput(iso) {
  if (!iso) return ''
  const d = new Date(iso)
  const pad = (n) => String(n).padStart(2, '0')
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`
}
