import { useCallback, useEffect, useState, type FormEvent } from 'react'
import { Link } from 'react-router-dom'

import { RequireAuth } from '@/features/auth/RequireAuth'
import { ApiError, apiGet, apiPost } from '@/lib/api'
import type { StaffUser } from '@/types/auth'
import type { Member, MemberListResponse } from '@/types/members'

const STATUS_LABEL: Record<string, string> = {
  pending: 'در انتظار',
  active: 'فعال',
  archived: 'آرشیو',
}

const canWrite = (role: string) => role === 'manager' || role === 'receptionist'

function MembersContent({ user }: { user: StaffUser }) {
  const [items, setItems] = useState<Member[]>([])
  const [q, setQ] = useState('')
  const [error, setError] = useState<string | null>(null)
  const [busy, setBusy] = useState(false)
  const [firstName, setFirstName] = useState('')
  const [lastName, setLastName] = useState('')
  const [mobile, setMobile] = useState('')
  const [notes, setNotes] = useState('')
  const [pwMemberId, setPwMemberId] = useState<number | ''>('')
  const [athletePassword, setAthletePassword] = useState('')
  const [pwMessage, setPwMessage] = useState<string | null>(null)

  const load = useCallback(async (search?: string) => {
    setError(null)
    const params = new URLSearchParams()
    if (search?.trim()) params.set('q', search.trim())
    const qs = params.toString()
    const path = qs ? `/api/v1/members?${qs}` : '/api/v1/members'
    try {
      const data = await apiGet<MemberListResponse>(path)
      setItems(data.items)
    } catch (err) {
      if (err instanceof ApiError) setError(err.message)
      else setError('بارگذاری اعضا ناموفق بود.')
    }
  }, [])

  useEffect(() => {
    void load()
  }, [load])

  async function onSearch(event: FormEvent) {
    event.preventDefault()
    await load(q)
  }

  async function onCreate(event: FormEvent) {
    event.preventDefault()
    if (!canWrite(user.role)) return
    setBusy(true)
    setError(null)
    try {
      await apiPost('/api/v1/members', {
        first_name: firstName.trim(),
        last_name: lastName.trim(),
        mobile: mobile.trim(),
        notes: notes.trim() || null,
      })
      setFirstName('')
      setLastName('')
      setMobile('')
      setNotes('')
      await load(q)
    } catch (err) {
      if (err instanceof ApiError) setError(err.message)
      else setError('ثبت عضو ناموفق بود.')
    } finally {
      setBusy(false)
    }
  }

  async function onArchive(id: number) {
    if (!canWrite(user.role)) return
    if (!window.confirm('این عضو آرشیو شود؟ (حذف دائمی نیست)')) return
    setBusy(true)
    setError(null)
    try {
      await apiPost(`/api/v1/members/${id}/archive`)
      await load(q)
    } catch (err) {
      if (err instanceof ApiError) setError(err.message)
      else setError('آرشیو ناموفق بود.')
    } finally {
      setBusy(false)
    }
  }

  async function onSetAthletePassword(event: FormEvent) {
    event.preventDefault()
    if (!canWrite(user.role) || !pwMemberId) return
    setBusy(true)
    setError(null)
    setPwMessage(null)
    try {
      await apiPost(`/api/v1/members/${pwMemberId}/athlete-password`, {
        password: athletePassword,
      })
      setAthletePassword('')
      setPwMessage('رمز ورود ورزشکار تنظیم شد.')
    } catch (err) {
      if (err instanceof ApiError) setError(err.message)
      else setError('ست رمز ناموفق بود.')
    } finally {
      setBusy(false)
    }
  }

  return (
    <main className="page">
      <p className="eyebrow">GYM CONTROL</p>
      <h1>اعضا</h1>
      <p className="lead">
        {user.full_name} · {user.role === 'trainer' ? 'فقط شاگردهای شما' : 'لیست باشگاه'}
      </p>

      <form className="auth-form" onSubmit={onSearch}>
        <label>
          جستجو (نام یا موبایل)
          <input value={q} onChange={(e) => setQ(e.target.value)} placeholder="مثلاً علی یا 0912…" />
        </label>
        <button type="submit" className="btn" disabled={busy}>
          جستجو
        </button>
      </form>

      {error ? (
        <p className="form-error" role="alert">
          {error}
        </p>
      ) : null}

      <section className="auth-panel">
        <p className="hint">تعداد: {items.length}</p>
        <ul className="member-list">
          {items.map((m) => (
            <li key={m.id}>
              <div>
                <strong>
                  {m.first_name} {m.last_name}
                </strong>
                <span className="hint"> · {m.display_id}</span>
                <div className="hint">
                  {m.mobile} · {STATUS_LABEL[m.status] ?? m.status}
                </div>
              </div>
              {canWrite(user.role) ? (
                <button
                  type="button"
                  className="btn btn-ghost"
                  disabled={busy || m.status === 'archived'}
                  onClick={() => void onArchive(m.id)}
                >
                  آرشیو
                </button>
              ) : null}
            </li>
          ))}
        </ul>
        {items.length === 0 ? <p className="hint">عضوی یافت نشد.</p> : null}
      </section>

      {canWrite(user.role) ? (
        <form className="auth-form" onSubmit={onSetAthletePassword}>
          <h2 className="form-title">رمز ورود ورزشکار</h2>
          <p className="hint">بدون پیامک — میز رمز را ست/عوض می‌کند. حداقل ۸ کاراکتر.</p>
          <label>
            عضو
            <select
              value={pwMemberId}
              onChange={(e) => setPwMemberId(e.target.value ? Number(e.target.value) : '')}
              required
            >
              <option value="">انتخاب کنید</option>
              {items
                .filter((m) => m.status !== 'archived')
                .map((m) => (
                  <option key={m.id} value={m.id}>
                    {m.display_id} · {m.first_name} {m.last_name}
                  </option>
                ))}
            </select>
          </label>
          <label>
            رمز جدید
            <input
              type="password"
              value={athletePassword}
              onChange={(e) => setAthletePassword(e.target.value)}
              minLength={8}
              required
            />
          </label>
          {pwMessage ? <p className="ok-msg">{pwMessage}</p> : null}
          <button type="submit" className="btn" disabled={busy}>
            ست رمز ورزشکار
          </button>
        </form>
      ) : null}

      {canWrite(user.role) ? (
        <form className="auth-form" onSubmit={onCreate}>
          <h2 className="form-title">ثبت عضو جدید</h2>
          <label>
            نام
            <input value={firstName} onChange={(e) => setFirstName(e.target.value)} required />
          </label>
          <label>
            نام خانوادگی
            <input value={lastName} onChange={(e) => setLastName(e.target.value)} required />
          </label>
          <label>
            موبایل
            <input
              value={mobile}
              onChange={(e) => setMobile(e.target.value)}
              inputMode="tel"
              minLength={10}
              required
            />
          </label>
          <label>
            یادداشت (اختیاری)
            <input value={notes} onChange={(e) => setNotes(e.target.value)} />
          </label>
          <button type="submit" className="btn" disabled={busy}>
            {busy ? 'در حال ثبت…' : 'ثبت عضو'}
          </button>
        </form>
      ) : (
        <p className="hint">مربی فقط فهرست شاگردها را می‌بیند؛ ثبت عضو برای منشی/مدیر است.</p>
      )}

      <p className="hint">
        <Link to="/attendance">حضور</Link>
        {' · '}
        <Link to="/login">حساب کاربری</Link>
        {' · '}
        <Link to="/">خانه</Link>
      </p>
    </main>
  )
}

export function MembersPage() {
  return <RequireAuth>{(user) => <MembersContent user={user} />}</RequireAuth>
}
