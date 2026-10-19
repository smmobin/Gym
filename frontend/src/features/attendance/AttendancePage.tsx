import { useCallback, useEffect, useState, type FormEvent } from 'react'
import { Link } from 'react-router-dom'

import { RequireAuth } from '@/features/auth/RequireAuth'
import { useMemberFileLock } from '@/hooks/useMemberFileLock'
import { ApiError, apiGet, apiPost } from '@/lib/api'
import { lockErrorMessage } from '@/lib/memberLock'
import type { Attendance, AttendanceType, CheckInResponse, TodayAttendancesResponse } from '@/types/attendance'
import type { StaffUser } from '@/types/auth'
import type { Member, MemberListResponse } from '@/types/members'

const TYPE_LABEL: Record<AttendanceType, string> = {
  gym: 'سالن',
  class: 'کلاس',
  pt: 'جلسه مربی',
}

function AttendanceContent({ user }: { user: StaffUser }) {
  const [q, setQ] = useState('')
  const [members, setMembers] = useState<Member[]>([])
  const [selected, setSelected] = useState<Member | null>(null)
  const [attendanceType, setAttendanceType] = useState<AttendanceType>('gym')
  const [today, setToday] = useState<Attendance[]>([])
  const [message, setMessage] = useState<string | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [busy, setBusy] = useState(false)
  const [pendingSecondConfirm, setPendingSecondConfirm] = useState(false)

  const {
    lock,
    lockError,
    lockHeldByMe,
    busy: lockBusy,
    release: releaseLock,
  } = useMemberFileLock(selected?.id ?? null)

  const loadToday = useCallback(async () => {
    const data = await apiGet<TodayAttendancesResponse>('/api/v1/attendances/today')
    setToday(data.items)
  }, [])

  useEffect(() => {
    void loadToday().catch(() => setError('بارگذاری حضور امروز ناموفق بود.'))
  }, [loadToday])

  async function onSearch(event: FormEvent) {
    event.preventDefault()
    setError(null)
    try {
      const params = new URLSearchParams()
      if (q.trim()) params.set('q', q.trim())
      const data = await apiGet<MemberListResponse>(
        `/api/v1/members?${params.toString()}`,
      )
      setMembers(data.items)
    } catch (err) {
      if (err instanceof ApiError) setError(err.message)
      else setError('جستجوی عضو ناموفق بود.')
    }
  }

  async function doCheckIn(confirmSecond: boolean) {
    if (!selected) return
    setBusy(true)
    setError(null)
    setMessage(null)
    try {
      const data = await apiPost<CheckInResponse>('/api/v1/attendances/check-in', {
        member_id: selected.id,
        attendance_type: attendanceType,
        confirm_second_visit: confirmSecond,
      })
      setPendingSecondConfirm(false)
      const parts = ['ورود ثبت شد.']
      if (data.debt_warning) parts.push(data.debt_warning)
      if (data.sessions_remaining != null) {
        parts.push(`جلسهٔ باقی‌مانده: ${data.sessions_remaining}`)
      }
      setMessage(parts.join(' '))
      await loadToday()
    } catch (err) {
      if (err instanceof ApiError) {
        if (err.status === 409 && err.message.includes('ورود دوم')) {
          setPendingSecondConfirm(true)
          setError(err.message)
        } else {
          setPendingSecondConfirm(false)
          setError(lockErrorMessage(err, 'ثبت ورود ناموفق بود.'))
        }
      } else {
        setError('ثبت ورود ناموفق بود.')
      }
    } finally {
      setBusy(false)
    }
  }

  async function onCheckOut(attendanceId: number) {
    setBusy(true)
    setError(null)
    try {
      await apiPost(`/api/v1/attendances/${attendanceId}/check-out`)
      setMessage('خروج ثبت شد.')
      await loadToday()
    } catch (err) {
      if (err instanceof ApiError) setError(err.message)
      else setError('ثبت خروج ناموفق بود.')
    } finally {
      setBusy(false)
    }
  }

  const openForSelected = today.find((a) => a.member_id === selected?.id && a.is_open)

  return (
    <main className="page">
      <p className="eyebrow">GYM CONTROL</p>
      <h1>حضور و غیاب</h1>
      <p className="lead">
        {user.full_name} · ثبت ورود/خروج امروز
      </p>

      <form className="auth-form" onSubmit={onSearch}>
        <label>
          جستجوی عضو
          <input value={q} onChange={(e) => setQ(e.target.value)} placeholder="نام یا موبایل" />
        </label>
        <button type="submit" className="btn" disabled={busy}>
          جستجو
        </button>
      </form>

      {members.length > 0 ? (
        <section className="auth-panel">
          <ul className="member-list">
            {members.map((m) => (
              <li key={m.id}>
                <button
                  type="button"
                  className={selected?.id === m.id ? 'btn' : 'btn btn-ghost'}
                  onClick={() => {
                    setSelected(m)
                    setPendingSecondConfirm(false)
                    setError(null)
                    setMessage(null)
                  }}
                >
                  {m.first_name} {m.last_name} · {m.display_id}
                </button>
              </li>
            ))}
          </ul>
        </section>
      ) : null}

      {selected ? (
        <section className="auth-form">
          <h2 className="form-title">
            عضو انتخاب‌شده: {selected.first_name} {selected.last_name}
          </h2>
          <div className="lock-banner" role="status">
            {lockBusy ? (
              <p className="hint">در حال گرفتن قفل پرونده…</p>
            ) : lockHeldByMe ? (
              <p className="ok-msg">
                قفل پرونده دست شماست.{' '}
                <button
                  type="button"
                  className="linkish"
                  disabled={busy}
                  onClick={() => void releaseLock()}
                >
                  آزادسازی قفل
                </button>
              </p>
            ) : lockError ? (
              <p className="err-msg">{lockError}</p>
            ) : lock?.locked ? (
              <p className="err-msg">
                قفل دست {lock.locked_by_name ?? 'کاربر دیگر'}
                {lock.locked_by_mobile ? ` (${lock.locked_by_mobile})` : ''} است.
              </p>
            ) : null}
          </div>
          <label>
            نوع ورود
            <select
              value={attendanceType}
              onChange={(e) => setAttendanceType(e.target.value as AttendanceType)}
            >
              {(Object.keys(TYPE_LABEL) as AttendanceType[]).map((key) => (
                <option key={key} value={key}>
                  {TYPE_LABEL[key]}
                </option>
              ))}
            </select>
          </label>
          {openForSelected ? (
            <button
              type="button"
              className="btn"
              disabled={busy}
              onClick={() => void onCheckOut(openForSelected.id)}
            >
              ثبت خروج
            </button>
          ) : (
            <button
              type="button"
              className="btn"
              disabled={busy}
              onClick={() => void doCheckIn(false)}
            >
              ثبت ورود
            </button>
          )}
          {pendingSecondConfirm ? (
            <button
              type="button"
              className="btn btn-ghost"
              disabled={busy}
              onClick={() => void doCheckIn(true)}
            >
              تأیید ورود دوم امروز
            </button>
          ) : null}
        </section>
      ) : null}

      {error ? (
        <p className="form-error" role="alert">
          {error}
        </p>
      ) : null}
      {message ? (
        <p className="form-ok" role="status">
          {message}
        </p>
      ) : null}

      <section className="auth-panel">
        <h2 className="form-title">حضور امروز ({today.length})</h2>
        <ul className="member-list">
          {today.map((a) => (
            <li key={a.id}>
              <div>
                <strong>#{a.id}</strong>
                <span className="hint">
                  {' '}
                  · عضو {a.member_id} · {TYPE_LABEL[a.attendance_type as AttendanceType] ?? a.attendance_type}
                </span>
                <div className="hint">
                  ورود: {new Date(a.check_in_at).toLocaleString('fa-IR')}
                  {a.is_open ? ' · باز' : ` · خروج: ${a.check_out_at ? new Date(a.check_out_at).toLocaleString('fa-IR') : '—'}`}
                </div>
              </div>
              {a.is_open ? (
                <button
                  type="button"
                  className="btn btn-ghost"
                  disabled={busy}
                  onClick={() => void onCheckOut(a.id)}
                >
                  خروج
                </button>
              ) : null}
            </li>
          ))}
        </ul>
        {today.length === 0 ? <p className="hint">امروز هنوز حضوری ثبت نشده.</p> : null}
      </section>

      <p className="hint">
        <Link to="/members">اعضا</Link>
        {' · '}
        <Link to="/login">حساب</Link>
        {' · '}
        <Link to="/">خانه</Link>
      </p>
    </main>
  )
}

export function AttendancePage() {
  return <RequireAuth>{(user) => <AttendanceContent user={user} />}</RequireAuth>
}
