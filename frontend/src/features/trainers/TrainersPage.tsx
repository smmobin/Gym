import { useCallback, useEffect, useState, type FormEvent } from 'react'
import { Link } from 'react-router-dom'

import { RequireAuth } from '@/features/auth/RequireAuth'
import { ApiError, apiGet, apiPost } from '@/lib/api'
import type { StaffUser } from '@/types/auth'
import type { Member, MemberListResponse } from '@/types/members'
import type {
  AssignmentListResponse,
  AssignTrainerResponse,
  EndAssignmentResponse,
  Trainer,
  TrainerAssignment,
  TrainerListResponse,
} from '@/types/trainers'

function TrainersContent({ user }: { user: StaffUser }) {
  const isDesk = user.role === 'manager' || user.role === 'receptionist'
  const [trainers, setTrainers] = useState<Trainer[]>([])
  const [q, setQ] = useState('')
  const [members, setMembers] = useState<Member[]>([])
  const [pickedMember, setPickedMember] = useState<Member | null>(null)
  const [assignments, setAssignments] = useState<TrainerAssignment[]>([])
  const [trainerUserId, setTrainerUserId] = useState<number | ''>('')

  const [message, setMessage] = useState<string | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [busy, setBusy] = useState(false)

  const loadTrainers = useCallback(async () => {
    const data = await apiGet<TrainerListResponse>('/api/v1/trainers')
    setTrainers(data.items)
  }, [])

  useEffect(() => {
    if (!isDesk) return
    void loadTrainers().catch(() => setError('بارگذاری مربیان ناموفق بود.'))
  }, [isDesk, loadTrainers])

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
      else setError('جستجوی عضو ناموفق بود.')
    }
  }

  async function selectMember(member: Member) {
    setPickedMember(member)
    setTrainerUserId('')
    setError(null)
    setMessage(null)
    try {
      const data = await apiGet<AssignmentListResponse>(
        `/api/v1/members/${member.id}/trainers`,
      )
      setAssignments(data.items)
    } catch (err) {
      if (err instanceof ApiError) setError(err.message)
      else setError('بارگذاری واگذاری‌ها ناموفق بود.')
    }
  }

  async function onAssign() {
    if (!pickedMember || trainerUserId === '') return
    setBusy(true)
    setError(null)
    setMessage(null)
    try {
      const data = await apiPost<AssignTrainerResponse>(
        `/api/v1/members/${pickedMember.id}/trainers`,
        { trainer_user_id: trainerUserId },
      )
      setMessage(
        `مربی ${data.assignment.trainer_full_name ?? ''} به ${pickedMember.first_name} وصل شد.`,
      )
      const refreshed = await apiGet<AssignmentListResponse>(
        `/api/v1/members/${pickedMember.id}/trainers`,
      )
      setAssignments(refreshed.items)
      setTrainerUserId('')
    } catch (err) {
      if (err instanceof ApiError) setError(err.message)
      else setError('واگذاری ناموفق بود.')
    } finally {
      setBusy(false)
    }
  }

  async function onEnd(assignmentId: number) {
    if (!pickedMember) return
    setBusy(true)
    setError(null)
    setMessage(null)
    try {
      const data = await apiPost<EndAssignmentResponse>(
        `/api/v1/members/${pickedMember.id}/trainers/${assignmentId}/end`,
      )
      setMessage(
        `واگذاری مربی ${data.assignment.trainer_full_name ?? ''} پایان یافت.`,
      )
      const refreshed = await apiGet<AssignmentListResponse>(
        `/api/v1/members/${pickedMember.id}/trainers`,
      )
      setAssignments(refreshed.items)
    } catch (err) {
      if (err instanceof ApiError) setError(err.message)
      else setError('قطع واگذاری ناموفق بود.')
    } finally {
      setBusy(false)
    }
  }

  if (!isDesk) {
    return (
      <main className="page">
        <p className="eyebrow">GYM CONTROL</p>
        <h1>مربیان</h1>
        <p className="err-msg">واگذاری مربی فقط برای مدیر و منشی است.</p>
        <p className="hint">
          مربیان برای نوشتن برنامه به <Link to="/workouts">برنامه‌ها</Link> بروند.
        </p>
      </main>
    )
  }

  const activeTrainerIds = new Set(
    assignments.filter((a) => a.is_active).map((a) => a.trainer_user_id),
  )
  const availableTrainers = trainers.filter((t) => !activeTrainerIds.has(t.id))

  return (
    <main className="page">
      <p className="eyebrow">GYM CONTROL</p>
      <h1>مربیان</h1>
      <p className="lead">
        {user.full_name} ({user.role === 'manager' ? 'مدیر' : 'منشی'})
        {' · '}
        <Link to="/">خانه</Link>
        {' · '}
        <Link to="/members">اعضا</Link>
        {' · '}
        <Link to="/workouts">برنامه‌ها</Link>
      </p>

      {message && <p className="ok-msg">{message}</p>}
      {error && <p className="err-msg">{error}</p>}

      <section className="auth-panel billing-block">
        <h2 className="form-title">مربیان فعال</h2>
        <ul className="member-list">
          {trainers.map((t) => (
            <li key={t.id}>
              <div>
                <strong>{t.full_name}</strong>
                <div className="hint">{t.mobile}</div>
              </div>
            </li>
          ))}
        </ul>
      </section>

      <section className="auth-panel billing-block">
        <h2 className="form-title">واگذاری شاگرد ↔ مربی</h2>
        <p className="hint">یک شاگرد می‌تواند چند مربی هم‌زمان داشته باشد.</p>
        <form className="auth-form" onSubmit={onSearch}>
          <label>
            جستجوی عضو
            <input value={q} onChange={(e) => setQ(e.target.value)} placeholder="نام یا موبایل" />
          </label>
          <button className="btn" type="submit" disabled={busy}>
            جستجو
          </button>
        </form>
        {members.length > 0 && (
          <ul className="member-list">
            {members.map((m) => (
              <li key={m.id}>
                <button type="button" className="linkish" onClick={() => void selectMember(m)}>
                  {m.display_id} — {m.first_name} {m.last_name}
                </button>
              </li>
            ))}
          </ul>
        )}
      </section>

      {pickedMember && (
        <section className="auth-panel billing-block">
          <h2 className="form-title">
            مربیان {pickedMember.display_id} — {pickedMember.first_name}{' '}
            {pickedMember.last_name}
          </h2>
          {assignments.length === 0 ? (
            <p className="hint">هنوز مربی فعالی ندارد.</p>
          ) : (
            <ul className="member-list">
              {assignments.map((a) => (
                <li key={a.id}>
                  <div>
                    <strong>{a.trainer_full_name ?? `مربی #${a.trainer_user_id}`}</strong>
                    <div className="hint">
                      {a.trainer_mobile}
                      {' · '}
                      از {new Date(a.assigned_at).toLocaleString('fa-IR')}
                    </div>
                  </div>
                  <button
                    type="button"
                    className="btn btn-ghost"
                    disabled={busy}
                    onClick={() => void onEnd(a.id)}
                  >
                    قطع
                  </button>
                </li>
              ))}
            </ul>
          )}
          <div className="auth-form">
            <label>
              افزودن مربی
              <select
                value={trainerUserId === '' ? '' : String(trainerUserId)}
                onChange={(e) =>
                  setTrainerUserId(e.target.value ? Number(e.target.value) : '')
                }
              >
                <option value="">انتخاب کنید</option>
                {availableTrainers.map((t) => (
                  <option key={t.id} value={t.id}>
                    {t.full_name} — {t.mobile}
                  </option>
                ))}
              </select>
            </label>
            <button
              type="button"
              className="btn"
              disabled={busy || trainerUserId === ''}
              onClick={() => void onAssign()}
            >
              وصل کردن
            </button>
          </div>
        </section>
      )}
    </main>
  )
}

export function TrainersPage() {
  return <RequireAuth>{(user) => <TrainersContent user={user} />}</RequireAuth>
}
