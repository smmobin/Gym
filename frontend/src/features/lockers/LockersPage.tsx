import { useCallback, useEffect, useState, type FormEvent } from 'react'
import { Link } from 'react-router-dom'

import { RequireAuth } from '@/features/auth/RequireAuth'
import { ApiError, apiGet, apiPost } from '@/lib/api'
import type { StaffUser } from '@/types/auth'
import type {
  AssignResponse,
  Locker,
  LockerListResponse,
  ReleaseResponse,
} from '@/types/lockers'
import type { Member, MemberListResponse } from '@/types/members'
import type {
  MembershipListResponse,
  MembershipPlanListResponse,
  MembershipRow,
} from '@/types/billing'

function LockersContent({ user }: { user: StaffUser }) {
  const isDesk = user.role === 'manager' || user.role === 'receptionist'
  const [lockers, setLockers] = useState<Locker[]>([])
  const [selected, setSelected] = useState<Locker | null>(null)
  const [q, setQ] = useState('')
  const [members, setMembers] = useState<Member[]>([])
  const [pickedMember, setPickedMember] = useState<Member | null>(null)
  const [memberships, setMemberships] = useState<MembershipRow[]>([])
  const [membershipId, setMembershipId] = useState<number | ''>('')
  const [note, setNote] = useState('')
  const [newCode, setNewCode] = useState('')

  const [message, setMessage] = useState<string | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [busy, setBusy] = useState(false)

  const loadLockers = useCallback(async () => {
    const data = await apiGet<LockerListResponse>('/api/v1/lockers')
    setLockers(data.items)
  }, [])

  useEffect(() => {
    if (!isDesk) return
    void loadLockers().catch(() => setError('بارگذاری کمدها ناموفق بود.'))
  }, [isDesk, loadLockers])

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
    setMembershipId('')
    setMemberships([])
    setError(null)
    try {
      const [ms, plans] = await Promise.all([
        apiGet<MembershipListResponse>(`/api/v1/members/${member.id}/memberships`),
        apiGet<MembershipPlanListResponse>('/api/v1/membership-plans'),
      ])
      const lockerPlanIds = new Set(
        plans.items.filter((p) => p.includes_locker).map((p) => p.id),
      )
      const withLocker = ms.items.filter(
        (m) => m.status === 'active' && lockerPlanIds.has(m.plan_id),
      )
      setMemberships(withLocker)
      if (withLocker.length === 0) {
        setError(
          'این عضو عضویت فعال با طرح شامل‌کمد ندارد. در نسخهٔ اول اجارهٔ جدا برای کمد نیست.',
        )
      } else if (withLocker.length === 1) {
        setMembershipId(withLocker[0].id)
      }
    } catch (err) {
      if (err instanceof ApiError) setError(err.message)
      else setError('بارگذاری عضویت‌ها ناموفق بود.')
    }
  }

  async function onAssign() {
    if (!selected || !pickedMember) return
    setBusy(true)
    setError(null)
    setMessage(null)
    try {
      const body: Record<string, unknown> = {
        member_id: pickedMember.id,
        note: note.trim() || undefined,
      }
      if (membershipId !== '') body.membership_id = membershipId
      const data = await apiPost<AssignResponse>(
        `/api/v1/lockers/${selected.id}/assign`,
        body,
      )
      setMessage(`کمد ${data.locker.code} به ${pickedMember.first_name} واگذار شد.`)
      setSelected(data.locker)
      setNote('')
      await loadLockers()
    } catch (err) {
      if (err instanceof ApiError) setError(err.message)
      else setError('واگذاری ناموفق بود.')
    } finally {
      setBusy(false)
    }
  }

  async function onRelease(lockerId: number) {
    setBusy(true)
    setError(null)
    setMessage(null)
    try {
      const data = await apiPost<ReleaseResponse>(`/api/v1/lockers/${lockerId}/release`)
      setMessage(`کمد ${data.locker.code} آزاد شد.`)
      if (selected?.id === lockerId) setSelected(data.locker)
      await loadLockers()
    } catch (err) {
      if (err instanceof ApiError) setError(err.message)
      else setError('آزادسازی ناموفق بود.')
    } finally {
      setBusy(false)
    }
  }

  async function onCreateLocker(event: FormEvent) {
    event.preventDefault()
    setBusy(true)
    setError(null)
    setMessage(null)
    try {
      const data = await apiPost<Locker>('/api/v1/lockers', { code: newCode.trim() })
      setMessage(`کمد ${data.code} ساخته شد.`)
      setNewCode('')
      await loadLockers()
    } catch (err) {
      if (err instanceof ApiError) setError(err.message)
      else setError('ساخت کمد ناموفق بود.')
    } finally {
      setBusy(false)
    }
  }

  if (!isDesk) {
    return (
      <main className="page">
        <p className="eyebrow">GYM CONTROL</p>
        <h1>کمدها</h1>
        <p className="err-msg">عملیات کمد فقط برای مدیر و منشی است.</p>
        <p className="hint">
          <Link to="/">خانه</Link>
        </p>
      </main>
    )
  }

  return (
    <main className="page">
      <p className="eyebrow">GYM CONTROL</p>
      <h1>کمدها</h1>
      <p className="lead">
        {user.full_name} ({user.role === 'manager' ? 'مدیر' : 'منشی'})
        {' · '}
        <Link to="/">خانه</Link>
        {' · '}
        <Link to="/members">اعضا</Link>
        {' · '}
        <Link to="/billing">مالی</Link>
        {' · '}
        <Link to="/classes">کلاس‌ها</Link>
      </p>

      {message && <p className="ok-msg">{message}</p>}
      {error && <p className="err-msg">{error}</p>}

      <section className="auth-panel billing-block">
        <h2 className="form-title">فهرست کمدها</h2>
        <ul className="member-list">
          {lockers.map((row) => (
            <li key={row.id}>
              <div>
                <button type="button" className="linkish" onClick={() => setSelected(row)}>
                  {row.code}
                </button>
                <div className="hint">
                  {!row.is_active
                    ? 'غیرفعال'
                    : row.is_free
                      ? 'آزاد'
                      : `اشغال — ${row.current_assignment?.member_name ?? row.current_assignment?.member_display_id ?? 'عضو'}`}
                </div>
              </div>
              {!row.is_free && row.is_active ? (
                <button
                  type="button"
                  className="btn btn-ghost"
                  disabled={busy}
                  onClick={() => void onRelease(row.id)}
                >
                  آزادسازی
                </button>
              ) : row.is_free && row.is_active ? (
                <button type="button" className="btn btn-ghost" onClick={() => setSelected(row)}>
                  واگذاری
                </button>
              ) : null}
            </li>
          ))}
        </ul>
      </section>

      {selected && selected.is_free && selected.is_active && (
        <section className="auth-panel billing-block">
          <h2 className="form-title">واگذاری کمد {selected.code}</h2>
          <p className="hint">
            فقط عضوی که عضویت فعال با طرح شامل‌کمد دارد. اجارهٔ جدا در این نسخه نیست.
          </p>
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
          {pickedMember && (
            <div className="auth-form">
              <p className="hint">
                انتخاب‌شده: {pickedMember.display_id} — {pickedMember.first_name}{' '}
                {pickedMember.last_name}
              </p>
              {memberships.length > 1 && (
                <label>
                  عضویت شامل‌کمد
                  <select
                    value={membershipId === '' ? '' : String(membershipId)}
                    onChange={(e) =>
                      setMembershipId(e.target.value ? Number(e.target.value) : '')
                    }
                  >
                    <option value="">انتخاب کنید</option>
                    {memberships.map((m) => (
                      <option key={m.id} value={m.id}>
                        #{m.id} — {m.plan_name ?? 'طرح'} تا {m.end_date}
                      </option>
                    ))}
                  </select>
                </label>
              )}
              <label>
                یادداشت (اختیاری)
                <input value={note} onChange={(e) => setNote(e.target.value)} />
              </label>
              <button
                type="button"
                className="btn"
                disabled={busy}
                onClick={() => void onAssign()}
              >
                تأیید واگذاری
              </button>
            </div>
          )}
        </section>
      )}

      <section className="auth-panel billing-block">
        <h2 className="form-title">ساخت کمد جدید</h2>
        <form className="auth-form" onSubmit={(e) => void onCreateLocker(e)}>
          <label>
            کد یکتا (مثلاً L-06)
            <input
              value={newCode}
              onChange={(e) => setNewCode(e.target.value)}
              required
              placeholder="L-06"
            />
          </label>
          <button className="btn" type="submit" disabled={busy}>
            ایجاد
          </button>
        </form>
      </section>
    </main>
  )
}

export function LockersPage() {
  return <RequireAuth>{(user) => <LockersContent user={user} />}</RequireAuth>
}
