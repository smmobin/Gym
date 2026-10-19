import { useCallback, useEffect, useState } from 'react'
import { Link } from 'react-router-dom'

import { RequireAuth } from '@/features/auth/RequireAuth'
import { ApiError, apiGet, apiPatch } from '@/lib/api'
import type { StaffUser } from '@/types/auth'
import type { TrialLead, TrialLeadListResponse, TrialLeadStatus } from '@/types/trialGuests'

const STATUS_LABEL: Record<TrialLeadStatus, string> = {
  new: 'جدید',
  contacted: 'تماس گرفته',
  converted: 'تبدیل‌شده',
  closed: 'بسته',
}

const STATUSES = Object.keys(STATUS_LABEL) as TrialLeadStatus[]

function TrialLeadsContent({ user }: { user: StaffUser }) {
  const isDesk = user.role === 'manager' || user.role === 'receptionist'
  const [items, setItems] = useState<TrialLead[]>([])
  const [filter, setFilter] = useState<string>('')
  const [error, setError] = useState<string | null>(null)
  const [busy, setBusy] = useState(false)

  const load = useCallback(async () => {
    const params = new URLSearchParams()
    if (filter) params.set('status', filter)
    const qs = params.toString()
    const data = await apiGet<TrialLeadListResponse>(
      qs ? `/api/v1/trial-leads?${qs}` : '/api/v1/trial-leads',
    )
    setItems(data.items)
  }, [filter])

  useEffect(() => {
    if (!isDesk) return
    void load().catch((err) => {
      if (err instanceof ApiError) setError(err.message)
      else setError('بارگذاری صف ناموفق بود.')
    })
  }, [isDesk, load])

  if (!isDesk) {
    return (
      <main className="page">
        <p className="eyebrow">GYM CONTROL</p>
        <h1>صف جلسه آزمایشی</h1>
        <p className="err-msg">فقط منشی و مدیر به این صف دسترسی دارند.</p>
        <p className="hint">
          <Link to="/">خانه</Link>
        </p>
      </main>
    )
  }

  async function onStatus(id: number, status: TrialLeadStatus) {
    setBusy(true)
    setError(null)
    try {
      await apiPatch(`/api/v1/trial-leads/${id}`, { status })
      await load()
    } catch (err) {
      if (err instanceof ApiError) setError(err.message)
      else setError('به‌روزرسانی وضعیت ناموفق بود.')
    } finally {
      setBusy(false)
    }
  }

  return (
    <main className="page">
      <p className="eyebrow">GYM CONTROL</p>
      <h1>صف جلسه آزمایشی</h1>
      <p className="lead">
        {user.full_name} · درخواست‌ها عضو خودکار نمی‌سازند؛ برای ورود مهمان از{' '}
        <Link to="/guests">ثبت مهمان روزانه</Link> استفاده کنید.
      </p>

      <label className="auth-form">
        فیلتر وضعیت
        <select value={filter} onChange={(e) => setFilter(e.target.value)} disabled={busy}>
          <option value="">همه</option>
          {STATUSES.map((s) => (
            <option key={s} value={s}>
              {STATUS_LABEL[s]}
            </option>
          ))}
        </select>
      </label>

      {error ? (
        <p className="err-msg" role="alert">
          {error}
        </p>
      ) : null}

      <section className="auth-panel">
        <p className="hint">تعداد: {items.length}</p>
        <ul className="status-list">
          {items.length === 0 ? <li>درخواستی نیست.</li> : null}
          {items.map((lead) => (
            <li key={lead.id}>
              <strong>
                {lead.full_name} · {lead.mobile}
              </strong>
              <div className="hint">
                {STATUS_LABEL[lead.status as TrialLeadStatus] ?? lead.status}
                {lead.preferred_time_note ? ` · ${lead.preferred_time_note}` : ''}
                {lead.message ? ` — ${lead.message}` : ''}
              </div>
              <div>
                {STATUSES.map((s) => (
                  <button
                    key={s}
                    type="button"
                    className="linkish"
                    disabled={busy || lead.status === s}
                    onClick={() => void onStatus(lead.id, s)}
                  >
                    {STATUS_LABEL[s]}
                  </button>
                ))}
              </div>
            </li>
          ))}
        </ul>
      </section>

      <p className="hint">
        <Link to="/guests">مهمان روزانه</Link>
        {' · '}
        <Link to="/members">اعضا</Link>
        {' · '}
        <Link to="/">خانه</Link>
      </p>
    </main>
  )
}

export function TrialLeadsPage() {
  return <RequireAuth>{(user) => <TrialLeadsContent user={user} />}</RequireAuth>
}
