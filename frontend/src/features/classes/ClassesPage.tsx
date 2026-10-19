import { useCallback, useEffect, useState, type FormEvent } from 'react'
import { Link } from 'react-router-dom'

import { RequireAuth } from '@/features/auth/RequireAuth'
import { ApiError, apiGet, apiPatch, apiPost } from '@/lib/api'
import type { StaffUser } from '@/types/auth'
import type {
  BookingListResponse,
  ClassBooking,
  GenderLabel,
  GroupClass,
  GroupClassListResponse,
  GroupClassMutationResponse,
  BookingMutationResponse,
} from '@/types/groupClasses'
import type { Member, MemberListResponse } from '@/types/members'

const GENDER_LABEL: Record<string, string> = {
  men: 'آقایان',
  women: 'بانوان',
  mixed: 'مختلط',
}

function formatWhen(iso: string): string {
  try {
    return new Date(iso).toLocaleString('fa-IR', {
      dateStyle: 'medium',
      timeStyle: 'short',
    })
  } catch {
    return iso
  }
}

function toLocalInputValue(d: Date): string {
  const pad = (n: number) => String(n).padStart(2, '0')
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`
}

function defaultFormTimes(): { starts: string; ends: string } {
  const start = new Date()
  start.setDate(start.getDate() + 1)
  start.setMinutes(0, 0, 0)
  const end = new Date(start)
  end.setHours(end.getHours() + 1)
  return { starts: toLocalInputValue(start), ends: toLocalInputValue(end) }
}

function ClassesContent({ user }: { user: StaffUser }) {
  const isDesk = user.role === 'manager' || user.role === 'receptionist'
  const [classes, setClasses] = useState<GroupClass[]>([])
  const [selected, setSelected] = useState<GroupClass | null>(null)
  const [bookings, setBookings] = useState<ClassBooking[]>([])
  const [q, setQ] = useState('')
  const [members, setMembers] = useState<Member[]>([])
  const [pickedMember, setPickedMember] = useState<Member | null>(null)

  const defaults = defaultFormTimes()
  const [title, setTitle] = useState('')
  const [capacity, setCapacity] = useState('12')
  const [genderLabel, setGenderLabel] = useState<GenderLabel>('mixed')
  const [startsAt, setStartsAt] = useState(defaults.starts)
  const [endsAt, setEndsAt] = useState(defaults.ends)
  const [editingId, setEditingId] = useState<number | null>(null)

  const [message, setMessage] = useState<string | null>(null)
  const [warning, setWarning] = useState<string | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [busy, setBusy] = useState(false)

  const loadClasses = useCallback(async () => {
    const data = await apiGet<GroupClassListResponse>('/api/v1/group-classes?upcoming=true')
    setClasses(data.items)
  }, [])

  const loadBookings = useCallback(async (classId: number) => {
    const data = await apiGet<BookingListResponse>(`/api/v1/group-classes/${classId}/bookings`)
    setBookings(data.items)
  }, [])

  useEffect(() => {
    void loadClasses().catch(() => setError('بارگذاری کلاس‌ها ناموفق بود.'))
  }, [loadClasses])

  async function selectClass(row: GroupClass) {
    setSelected(row)
    setError(null)
    setMessage(null)
    try {
      await loadBookings(row.id)
    } catch (err) {
      if (err instanceof ApiError) setError(err.message)
      else setError('بارگذاری رزروها ناموفق بود.')
    }
  }

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

  async function onBook() {
    if (!selected || !pickedMember) return
    setBusy(true)
    setError(null)
    setMessage(null)
    try {
      const data = await apiPost<BookingMutationResponse>(
        `/api/v1/group-classes/${selected.id}/bookings`,
        { member_id: pickedMember.id },
      )
      setMessage(`رزرو ثبت شد. باقی‌مانده: ${data.remaining}`)
      await loadClasses()
      await loadBookings(selected.id)
      const refreshed = await apiGet<GroupClassListResponse>('/api/v1/group-classes?upcoming=true')
      const updated = refreshed.items.find((c) => c.id === selected.id)
      if (updated) setSelected(updated)
    } catch (err) {
      if (err instanceof ApiError) setError(err.message)
      else setError('رزرو ناموفق بود.')
    } finally {
      setBusy(false)
    }
  }

  async function onCancelBooking(bookingId: number) {
    if (!selected) return
    setBusy(true)
    setError(null)
    setMessage(null)
    try {
      const data = await apiPost<BookingMutationResponse>(
        `/api/v1/group-classes/${selected.id}/bookings/${bookingId}/cancel`,
      )
      setMessage(`رزرو لغو شد. باقی‌مانده: ${data.remaining}`)
      await loadClasses()
      await loadBookings(selected.id)
      const refreshed = await apiGet<GroupClassListResponse>('/api/v1/group-classes?upcoming=true')
      const updated = refreshed.items.find((c) => c.id === selected.id)
      if (updated) setSelected(updated)
    } catch (err) {
      if (err instanceof ApiError) setError(err.message)
      else setError('لغو رزرو ناموفق بود.')
    } finally {
      setBusy(false)
    }
  }

  function startEdit(row: GroupClass) {
    setEditingId(row.id)
    setTitle(row.title)
    setCapacity(String(row.capacity))
    setGenderLabel((row.gender_label as GenderLabel) || 'mixed')
    setStartsAt(toLocalInputValue(new Date(row.starts_at)))
    setEndsAt(toLocalInputValue(new Date(row.ends_at)))
    setWarning(null)
    setMessage(null)
    setError(null)
  }

  function resetForm() {
    const t = defaultFormTimes()
    setEditingId(null)
    setTitle('')
    setCapacity('12')
    setGenderLabel('mixed')
    setStartsAt(t.starts)
    setEndsAt(t.ends)
  }

  async function onSaveClass(event: FormEvent) {
    event.preventDefault()
    if (!isDesk) return
    setBusy(true)
    setError(null)
    setMessage(null)
    setWarning(null)
    try {
      const cap = Number(capacity)
      if (!Number.isFinite(cap) || cap <= 0) {
        setError('ظرفیت باید عدد مثبت باشد.')
        return
      }
      const body = {
        title: title.trim(),
        capacity: cap,
        gender_label: genderLabel,
        starts_at: new Date(startsAt).toISOString(),
        ends_at: new Date(endsAt).toISOString(),
      }
      let data: GroupClassMutationResponse
      if (editingId != null) {
        data = await apiPatch<GroupClassMutationResponse>(
          `/api/v1/group-classes/${editingId}`,
          body,
        )
      } else {
        data = await apiPost<GroupClassMutationResponse>('/api/v1/group-classes', body)
      }
      if (data.trainer_schedule_conflict && data.warning) {
        setWarning(data.warning)
      }
      setMessage(editingId != null ? 'کلاس به‌روز شد.' : 'کلاس ساخته شد.')
      resetForm()
      await loadClasses()
    } catch (err) {
      if (err instanceof ApiError) setError(err.message)
      else setError('ذخیرهٔ کلاس ناموفق بود.')
    } finally {
      setBusy(false)
    }
  }

  return (
    <main className="page">
      <p className="eyebrow">GYM CONTROL</p>
      <h1>کلاس‌های گروهی</h1>
      <p className="lead">
        {user.full_name} ({user.role === 'manager' ? 'مدیر' : user.role === 'receptionist' ? 'منشی' : 'مربی'})
        {' · '}
        <Link to="/">خانه</Link>
        {' · '}
        <Link to="/members">اعضا</Link>
        {' · '}
        <Link to="/attendance">حضور</Link>
        {' · '}
        <Link to="/billing">مالی</Link>
      </p>

      {message && <p className="ok-msg">{message}</p>}
      {warning && <p className="form-error">{warning}</p>}
      {error && <p className="err-msg">{error}</p>}

      <section className="auth-panel billing-block">
        <h2 className="form-title">کلاس‌های پیش‌رو</h2>
        {classes.length === 0 ? (
          <p className="hint">کلاسی برای نمایش نیست.</p>
        ) : (
          <ul className="member-list">
            {classes.map((row) => (
              <li key={row.id}>
                <div>
                  <button type="button" className="linkish" onClick={() => void selectClass(row)}>
                    {row.title}
                  </button>
                  <div className="hint">
                    {formatWhen(row.starts_at)} — {GENDER_LABEL[row.gender_label] ?? row.gender_label}
                    {' · '}
                    ظرفیت {row.capacity.toLocaleString('fa-IR')} / رزرو{' '}
                    {row.booked_count.toLocaleString('fa-IR')} / باقی{' '}
                    {row.remaining.toLocaleString('fa-IR')}
                  </div>
                </div>
                {isDesk && (
                  <button type="button" className="btn btn-ghost" onClick={() => startEdit(row)}>
                    ویرایش
                  </button>
                )}
              </li>
            ))}
          </ul>
        )}
      </section>

      {selected && (
        <section className="auth-panel billing-block">
          <h2 className="form-title">رزروهای «{selected.title}»</h2>
          <p className="hint">
            باقی‌مانده: {selected.remaining.toLocaleString('fa-IR')} از{' '}
            {selected.capacity.toLocaleString('fa-IR')}
          </p>

          {isDesk && (
            <>
              <form className="auth-form" onSubmit={onSearch}>
                <label>
                  جستجوی عضو برای رزرو
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
                      <button type="button" className="linkish" onClick={() => setPickedMember(m)}>
                        {m.display_id} — {m.first_name} {m.last_name}
                      </button>
                      {pickedMember?.id === m.id && (
                        <button
                          type="button"
                          className="btn"
                          disabled={busy || selected.remaining <= 0}
                          onClick={() => void onBook()}
                        >
                          رزرو
                        </button>
                      )}
                    </li>
                  ))}
                </ul>
              )}
            </>
          )}

          <ul className="member-list">
            {bookings
              .filter((b) => b.status === 'booked')
              .map((b) => (
                <li key={b.id}>
                  <span>
                    {b.member_display_id ?? b.member_id} — {b.member_name ?? 'عضو'}
                  </span>
                  {isDesk && (
                    <button
                      type="button"
                      className="btn btn-ghost"
                      disabled={busy}
                      onClick={() => void onCancelBooking(b.id)}
                    >
                      لغو
                    </button>
                  )}
                </li>
              ))}
          </ul>
          {bookings.filter((b) => b.status === 'booked').length === 0 && (
            <p className="hint">رزرو فعالی نیست.</p>
          )}
        </section>
      )}

      {isDesk && (
        <section className="auth-panel billing-block">
          <h2 className="form-title">{editingId != null ? 'ویرایش کلاس' : 'ساخت کلاس جدید'}</h2>
          <form className="auth-form" onSubmit={(e) => void onSaveClass(e)}>
            <label>
              عنوان
              <input value={title} onChange={(e) => setTitle(e.target.value)} required />
            </label>
            <label>
              ظرفیت
              <input
                type="number"
                min={1}
                value={capacity}
                onChange={(e) => setCapacity(e.target.value)}
                required
              />
            </label>
            <label>
              برچسب جنسیت (نمایشی)
              <select
                value={genderLabel}
                onChange={(e) => setGenderLabel(e.target.value as GenderLabel)}
              >
                <option value="mixed">مختلط</option>
                <option value="men">آقایان</option>
                <option value="women">بانوان</option>
              </select>
            </label>
            <label>
              شروع
              <input
                type="datetime-local"
                value={startsAt}
                onChange={(e) => setStartsAt(e.target.value)}
                required
              />
            </label>
            <label>
              پایان
              <input
                type="datetime-local"
                value={endsAt}
                onChange={(e) => setEndsAt(e.target.value)}
                required
              />
            </label>
            <div style={{ display: 'flex', gap: '0.75rem', flexWrap: 'wrap' }}>
              <button className="btn" type="submit" disabled={busy}>
                {editingId != null ? 'ذخیره تغییرات' : 'ایجاد کلاس'}
              </button>
              {editingId != null && (
                <button type="button" className="btn btn-ghost" onClick={resetForm}>
                  انصراف از ویرایش
                </button>
              )}
            </div>
          </form>
        </section>
      )}

      {!isDesk && (
        <p className="hint">مربی فقط کلاس‌های خودش را می‌بیند؛ رزرو/ساخت فقط برای منشی و مدیر است.</p>
      )}
    </main>
  )
}

export function ClassesPage() {
  return <RequireAuth>{(user) => <ClassesContent user={user} />}</RequireAuth>
}
