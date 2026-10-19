import { useEffect, useState } from 'react'
import { Link } from 'react-router-dom'

import { apiGet } from '@/lib/api'
import type { HealthResponse } from '@/types'

export function HomePage() {
  const [apiStatus, setApiStatus] = useState<'loading' | 'ok' | 'down'>('loading')
  const [dbStatus, setDbStatus] = useState<'loading' | 'ok' | 'down'>('loading')

  useEffect(() => {
    apiGet<HealthResponse>('/api/v1/health')
      .then(() => setApiStatus('ok'))
      .catch(() => setApiStatus('down'))

    apiGet<HealthResponse>('/api/v1/health/db')
      .then(() => setDbStatus('ok'))
      .catch(() => setDbStatus('down'))
  }, [])

  return (
    <main className="page">
      <p className="eyebrow">GYM CONTROL</p>
      <h1>باشگاه آذر</h1>
      <p className="lead">
        اسکلت فرانت‌اند React آماده است. پروتوتایپ HTML در ریشهٔ ریپو به‌عنوان مرجع UI باقی مانده.
      </p>

      <ul className="status-list">
        <li>
          API: <strong data-state={apiStatus}>{label(apiStatus)}</strong>
        </li>
        <li>
          Database: <strong data-state={dbStatus}>{label(dbStatus)}</strong>
        </li>
      </ul>

      <p className="hint">
        <Link to="/trial">جلسه آزمایشی (عمومی)</Link>
        {' · '}
        <Link to="/login">ورود کارکنان</Link>
        {' · '}
        <Link to="/members">اعضا</Link>
        {' · '}
        <Link to="/guests">مهمان روزانه</Link>
        {' · '}
        <Link to="/trial-leads">صف آزمایشی</Link>
        {' · '}
        <Link to="/attendance">حضور</Link>
        {' · '}
        <Link to="/billing">مالی</Link>
        {' · '}
        <Link to="/reports">گزارش مدیر</Link>
        {' · '}
        <Link to="/settings">تنظیمات</Link>
        {' · '}
        <Link to="/sms-templates">قالب پیامک</Link>
        {' · '}
        <Link to="/classes">کلاس‌ها</Link>
        {' · '}
        <Link to="/lockers">کمدها</Link>
        {' · '}
        <Link to="/trainers">مربیان</Link>
        {' · '}
        <Link to="/workouts">برنامه‌ها</Link>
        {' · '}
        پروتوتایپ HTML: فایل‌های <code>index.html</code> در ریشهٔ پروژه.
      </p>
    </main>
  )
}

function label(state: 'loading' | 'ok' | 'down') {
  if (state === 'loading') return 'در حال بررسی…'
  if (state === 'ok') return 'متصل'
  return 'قطع — بک‌اند را اجرا کنید'
}
