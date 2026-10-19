import { useCallback, useEffect, useState, type FormEvent } from 'react'
import { Link } from 'react-router-dom'

import { RequireAuth } from '@/features/auth/RequireAuth'
import { useMemberFileLock } from '@/hooks/useMemberFileLock'
import { ApiError, apiGet, apiPatch, apiPost } from '@/lib/api'
import { lockErrorMessage } from '@/lib/memberLock'
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
  const [selectedId, setSelectedId] = useState<number | null>(null)
  const [editFirst, setEditFirst] = useState('')
  const [editLast, setEditLast] = useState('')
  const [editMobile, setEditMobile] = useState('')
  const [editNotes, setEditNotes] = useState('')
  const [athletePassword, setAthletePassword] = useState('')
  const [pwMessage, setPwMessage] = useState<string | null>(null)

  const {
    lock,
    lockError,
    lockHeldByMe,
    busy: lockBusy,
    release: releaseLock,
  } = useMemberFileLock(canWrite(user.role) ? selectedId : null)

  const selected = items.find((m) => m.id === selectedId) ?? null

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

  useEffect(() => {
    if (!selected) {
      setEditFirst('')
      setEditLast('')
      setEditMobile('')
      setEditNotes('')
      return
    }
    setEditFirst(selected.first_name)
    setEditLast(selected.last_name)
    setEditMobile(selected.mobile)
    setEditNotes(selected.notes ?? '')
    setPwMessage(null)
    setAthletePassword('')
  }, [selected])

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
      if (selectedId === id) setSelectedId(null)
      await load(q)
    } catch (err) {
      setError(lockErrorMessage(err, 'آرشیو ناموفق بود.'))
    } finally {
      setBusy(false)
    }
  }

  async function onSaveEdit(event: FormEvent) {
    event.preventDefault()
    if (!canWrite(user.role) || !selectedId || !lockHeldByMe) return
    setBusy(true)
    setError(null)
    try {
      await apiPatch(`/api/v1/members/${selectedId}`, {
        first_name: editFirst.trim(),
        last_name: editLast.trim(),
        mobile: editMobile.trim(),
        notes: editNotes.trim() || null,
      })
      await load(q)
    } catch (err) {
      setError(lockErrorMessage(err, 'ذخیرهٔ ویرایش ناموفق بود.'))
    } finally {
      setBusy(false)
    }
  }

  async function onSetAthletePassword(event: FormEvent) {
    event.preventDefault()
    if (!canWrite(user.role) || !selectedId || !lockHeldByMe) return
    setBusy(true)
    setError(null)
    setPwMessage(null)
    try {
      await apiPost(`/api/v1/members/${selectedId}/athlete-password`, {
        password: athletePassword,
      })
      setAthletePassword('')
      setPwMessage('رمز ورود ورزشکار تنظیم شد.')
    } catch (err) {
      setError(lockErrorMessage(err, 'ست رمز ناموفق بود.'))
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
              <div className="member-actions">
                {canWrite(user.role) && m.status !== 'archived' ? (
                  <button
                    type="button"
                    className="btn btn-ghost"
                    disabled={busy}
                    onClick={() => setSelectedId(m.id)}
                  >
                    {selectedId === m.id ? 'انتخاب‌شده' : 'ویرایش / قفل'}
                  </button>
                ) : null}
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
              </div>
            </li>
          ))}
        </ul>
        {items.length === 0 ? <p className="hint">عضوی یافت نشد.</p> : null}
      </section>

      {canWrite(user.role) && selected ? (
        <section className="billing-block">
          <h2>
            ویرایش {selected.display_id} — {selected.first_name} {selected.last_name}
          </h2>
          <div className="lock-banner" role="status">
            {lockBusy ? (
              <p className="hint">در حال گرفتن قفل پرونده…</p>
            ) : lockHeldByMe ? (
              <p className="ok-msg">
                قفل پرونده دست شماست
                {lock?.expires_at
                  ? ` تا ${new Date(lock.expires_at).toLocaleString('fa-IR')}`
                  : ''}
                .{' '}
                <button
                  type="button"
                  className="linkish"
                  disabled={busy}
                  onClick={() => {
                    void releaseLock()
                    setSelectedId(null)
                  }}
                >
                  آزادسازی قفل
                </button>
              </p>
            ) : lockError ? (
              <p className="err-msg">{lockError}</p>
            ) : lock?.locked ? (
              <p className="err-msg">
                قفل دست {lock.locked_by_name ?? 'کاربر دیگر'}
                {lock.locked_by_mobile ? ` (${lock.locked_by_mobile})` : ''} است
                {lock.expires_at
                  ? ` — انقضا: ${new Date(lock.expires_at).toLocaleString('fa-IR')}`
                  : ''}
                .
              </p>
            ) : (
              <p className="hint">قفل فعالی نیست.</p>
            )}
          </div>

          <form className="auth-form" onSubmit={onSaveEdit}>
            <label>
              نام
              <input
                value={editFirst}
                onChange={(e) => setEditFirst(e.target.value)}
                required
                disabled={!lockHeldByMe}
              />
            </label>
            <label>
              نام خانوادگی
              <input
                value={editLast}
                onChange={(e) => setEditLast(e.target.value)}
                required
                disabled={!lockHeldByMe}
              />
            </label>
            <label>
              موبایل
              <input
                value={editMobile}
                onChange={(e) => setEditMobile(e.target.value)}
                inputMode="tel"
                minLength={10}
                required
                disabled={!lockHeldByMe}
              />
            </label>
            <label>
              یادداشت
              <input
                value={editNotes}
                onChange={(e) => setEditNotes(e.target.value)}
                disabled={!lockHeldByMe}
              />
            </label>
            <button type="submit" className="btn" disabled={busy || !lockHeldByMe}>
              ذخیرهٔ ویرایش
            </button>
          </form>

          <form className="auth-form" onSubmit={onSetAthletePassword}>
            <h2 className="form-title">رمز ورود ورزشکار</h2>
            <p className="hint">بدون پیامک — میز رمز را ست/عوض می‌کند. حداقل ۸ کاراکتر. نیاز به قفل.</p>
            <label>
              رمز جدید
              <input
                type="password"
                value={athletePassword}
                onChange={(e) => setAthletePassword(e.target.value)}
                minLength={8}
                required
                disabled={!lockHeldByMe}
              />
            </label>
            {pwMessage ? <p className="ok-msg">{pwMessage}</p> : null}
            <button type="submit" className="btn" disabled={busy || !lockHeldByMe}>
              ست رمز ورزشکار
            </button>
          </form>
        </section>
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
