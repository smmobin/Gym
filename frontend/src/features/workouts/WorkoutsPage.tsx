import { useCallback, useEffect, useState, type FormEvent } from 'react'
import { Link } from 'react-router-dom'

import { RequireAuth } from '@/features/auth/RequireAuth'
import { ApiError, apiGet, apiPatch, apiPost } from '@/lib/api'
import type { StaffUser } from '@/types/auth'
import type { Member, MemberListResponse } from '@/types/members'
import type { WorkoutPlan, WorkoutPlanListResponse } from '@/types/workoutPlans'

const ROLE_LABEL: Record<string, string> = {
  manager: 'مدیر',
  receptionist: 'منشی',
  trainer: 'مربی',
}

function WorkoutsContent({ user }: { user: StaffUser }) {
  const canWrite = user.role === 'manager' || user.role === 'trainer'
  const [members, setMembers] = useState<Member[]>([])
  const [picked, setPicked] = useState<Member | null>(null)
  const [plans, setPlans] = useState<WorkoutPlan[]>([])
  const [editing, setEditing] = useState<WorkoutPlan | null>(null)
  const [title, setTitle] = useState('')
  const [body, setBody] = useState('')
  const [q, setQ] = useState('')

  const [message, setMessage] = useState<string | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [busy, setBusy] = useState(false)

  const loadMembers = useCallback(async () => {
    const data = await apiGet<MemberListResponse>('/api/v1/members')
    setMembers(data.items)
  }, [])

  useEffect(() => {
    void loadMembers().catch(() => setError('بارگذاری شاگردها ناموفق بود.'))
  }, [loadMembers])

  async function onSearch(event: FormEvent) {
    event.preventDefault()
    setError(null)
    try {
      const params = new URLSearchParams()
      if (q.trim()) params.set('q', q.trim())
      const data = await apiGet<MemberListResponse>(`/api/v1/members?${params.toString()}`)
      setMembers(data.items)
    } catch (err) {
      if (err instanceof ApiError) setError(err.message)
      else setError('جستجو ناموفق بود.')
    }
  }

  async function selectMember(member: Member) {
    setPicked(member)
    setEditing(null)
    setTitle('')
    setBody('')
    setError(null)
    setMessage(null)
    try {
      const data = await apiGet<WorkoutPlanListResponse>(
        `/api/v1/members/${member.id}/workout-plans`,
      )
      setPlans(data.items)
    } catch (err) {
      setPlans([])
      if (err instanceof ApiError) setError(err.message)
      else setError('بارگذاری برنامه ناموفق بود.')
    }
  }

  function startEdit(plan: WorkoutPlan) {
    setEditing(plan)
    setTitle(plan.title)
    setBody(plan.body ?? '')
    setMessage(null)
    setError(null)
  }

  function startCreate() {
    setEditing(null)
    setTitle('')
    setBody('')
    setMessage(null)
    setError(null)
  }

  async function onSave(event: FormEvent) {
    event.preventDefault()
    if (!picked || !canWrite) return
    setBusy(true)
    setError(null)
    setMessage(null)
    try {
      if (editing) {
        await apiPatch<WorkoutPlan>(`/api/v1/workout-plans/${editing.id}`, {
          title: title.trim(),
          body: body.trim() || null,
        })
        setMessage('برنامه به‌روز شد.')
      } else {
        await apiPost<WorkoutPlan>(`/api/v1/members/${picked.id}/workout-plans`, {
          title: title.trim(),
          body: body.trim() || null,
        })
        setMessage('برنامه ساخته شد.')
      }
      const data = await apiGet<WorkoutPlanListResponse>(
        `/api/v1/members/${picked.id}/workout-plans`,
      )
      setPlans(data.items)
      setEditing(null)
      setTitle('')
      setBody('')
    } catch (err) {
      if (err instanceof ApiError) setError(err.message)
      else setError('ذخیره ناموفق بود.')
    } finally {
      setBusy(false)
    }
  }

  return (
    <main className="page">
      <p className="eyebrow">GYM CONTROL</p>
      <h1>برنامه تمرینی</h1>
      <p className="lead">
        {user.full_name} ({ROLE_LABEL[user.role] ?? user.role})
        {' · '}
        <Link to="/">خانه</Link>
        {' · '}
        <Link to="/members">اعضا</Link>
        {(user.role === 'manager' || user.role === 'receptionist') && (
          <>
            {' · '}
            <Link to="/trainers">مربیان</Link>
          </>
        )}
      </p>
      {!canWrite && (
        <p className="hint">منشی فقط می‌تواند برنامه‌ها را ببیند؛ نوشتن با مربی و مدیر است.</p>
      )}

      {message && <p className="ok-msg">{message}</p>}
      {error && <p className="err-msg">{error}</p>}

      <section className="auth-panel billing-block">
        <h2 className="form-title">شاگردها</h2>
        <p className="hint">
          {user.role === 'trainer'
            ? 'فقط شاگردهایی که به شما واگذار شده‌اند.'
            : 'همهٔ اعضا (مدیر/منشی).'}
        </p>
        <form className="auth-form" onSubmit={onSearch}>
          <label>
            جستجو
            <input value={q} onChange={(e) => setQ(e.target.value)} placeholder="نام یا موبایل" />
          </label>
          <button className="btn" type="submit" disabled={busy}>
            جستجو
          </button>
        </form>
        <ul className="member-list">
          {members.map((m) => (
            <li key={m.id}>
              <button type="button" className="linkish" onClick={() => void selectMember(m)}>
                {m.display_id} — {m.first_name} {m.last_name}
              </button>
            </li>
          ))}
        </ul>
        {members.length === 0 && <p className="hint">شاگردی در لیست نیست.</p>}
      </section>

      {picked && (
        <section className="auth-panel billing-block">
          <h2 className="form-title">
            برنامه‌های {picked.display_id} — {picked.first_name} {picked.last_name}
          </h2>
          {plans.length === 0 ? (
            <p className="hint">هنوز برنامه‌ای ثبت نشده.</p>
          ) : (
            <ul className="member-list">
              {plans.map((p) => (
                <li key={p.id}>
                  <div>
                    <strong>{p.title}</strong>
                    <div className="hint">
                      {p.trainer_full_name ?? `نویسنده #${p.trainer_user_id}`}
                      {' · '}
                      {new Date(p.created_at).toLocaleString('fa-IR')}
                    </div>
                    {p.body && <p className="hint">{p.body}</p>}
                  </div>
                  {canWrite && (
                    <button
                      type="button"
                      className="btn btn-ghost"
                      onClick={() => startEdit(p)}
                    >
                      ویرایش
                    </button>
                  )}
                </li>
              ))}
            </ul>
          )}

          {canWrite && (
            <form className="auth-form" onSubmit={(e) => void onSave(e)}>
              <h3 className="form-title">
                {editing ? 'ویرایش برنامه' : 'برنامهٔ جدید'}
              </h3>
              {editing && (
                <button type="button" className="btn btn-ghost" onClick={startCreate}>
                  انصراف از ویرایش
                </button>
              )}
              <label>
                عنوان
                <input
                  value={title}
                  onChange={(e) => setTitle(e.target.value)}
                  required
                  maxLength={160}
                />
              </label>
              <label>
                متن برنامه
                <textarea
                  value={body}
                  onChange={(e) => setBody(e.target.value)}
                  rows={6}
                  placeholder="مثلاً اسکات ۳×۱۰ — پرس سینه ۳×۸"
                />
              </label>
              <button className="btn" type="submit" disabled={busy || !title.trim()}>
                ذخیره
              </button>
            </form>
          )}
        </section>
      )}
    </main>
  )
}

export function WorkoutsPage() {
  return <RequireAuth>{(user) => <WorkoutsContent user={user} />}</RequireAuth>
}
