import { useCallback, useEffect, useState } from 'react'
import { Link } from 'react-router-dom'

import { ApiError, apiGet, apiPost } from '@/lib/api'
import type { NotificationListResponse, StaffNotification } from '@/types/notifications'

export function NotificationBell() {
  const [open, setOpen] = useState(false)
  const [items, setItems] = useState<StaffNotification[]>([])
  const [unread, setUnread] = useState(0)
  const [error, setError] = useState<string | null>(null)

  const load = useCallback(async () => {
    const data = await apiGet<NotificationListResponse>('/api/v1/notifications')
    setItems(data.items.slice(0, 12))
    setUnread(data.unread_count)
  }, [])

  useEffect(() => {
    void load().catch((err) => {
      if (err instanceof ApiError && err.status === 401) return
      setError(err instanceof ApiError ? err.message : 'بارگذاری اعلان ناموفق')
    })
  }, [load])

  async function onMark(id: number) {
    try {
      await apiPost(`/api/v1/notifications/${id}/read`)
      await load()
    } catch {
      setError('خواندن اعلان ناموفق بود.')
    }
  }

  async function onMarkAll() {
    try {
      await apiPost('/api/v1/notifications/read-all')
      await load()
    } catch {
      setError('خواندن همه ناموفق بود.')
    }
  }

  return (
    <div className="notif-bell">
      <button
        type="button"
        className="notif-bell__btn"
        aria-expanded={open}
        aria-label="اعلان‌ها"
        onClick={() => setOpen((v) => !v)}
      >
        اعلان‌ها
        {unread > 0 ? <span className="notif-bell__badge">{unread}</span> : null}
      </button>
      {open ? (
        <div className="notif-bell__panel" role="dialog" aria-label="فهرست اعلان">
          <div className="notif-bell__head">
            <strong>اعلان‌های کارکنان</strong>
            <button type="button" className="linkish" onClick={() => void onMarkAll()}>
              همه خوانده شد
            </button>
          </div>
          {error ? (
            <p className="err-msg" role="alert">
              {error}
            </p>
          ) : null}
          {items.length === 0 ? (
            <p className="hint">اعلانی نیست.</p>
          ) : (
            <ul className="notif-bell__list">
              {items.map((n) => (
                <li key={n.id} data-read={n.is_read ? '1' : '0'}>
                  <div>
                    <strong>{n.title}</strong>
                    {n.body ? <p>{n.body}</p> : null}
                    <p className="hint">
                      {n.href ? <Link to={n.href}>{linkLabel(n)}</Link> : null}
                      {' · '}
                      {!n.is_read ? (
                        <button type="button" className="linkish" onClick={() => void onMark(n.id)}>
                          خواندم
                        </button>
                      ) : (
                        <span>خوانده‌شده</span>
                      )}
                    </p>
                  </div>
                </li>
              ))}
            </ul>
          )}
          <p className="hint">
            <Link to="/sms-templates">قالب پیامک (آماده نیست)</Link>
          </p>
        </div>
      ) : null}
    </div>
  )
}

function linkLabel(n: StaffNotification): string {
  if (n.kind === 'trial_lead_new') return 'صف آزمایشی'
  if (n.kind === 'member_debt' || n.kind === 'membership_expiring') return 'مالی / عضو'
  if (n.kind === 'renewal_request') return 'مالی'
  return 'باز کردن'
}
