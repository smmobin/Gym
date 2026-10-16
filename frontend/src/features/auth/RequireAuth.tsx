import { useEffect, useState, type ReactNode } from 'react'
import { Navigate } from 'react-router-dom'

import { apiGet } from '@/lib/api'
import type { MeResponse, StaffUser } from '@/types/auth'

type Props = {
  children: (user: StaffUser) => ReactNode
}

export function RequireAuth({ children }: Props) {
  const [user, setUser] = useState<StaffUser | null>(null)
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    apiGet<MeResponse>('/api/v1/auth/me')
      .then((data) => setUser(data.user))
      .catch(() => setUser(null))
      .finally(() => setLoading(false))
  }, [])

  if (loading) {
    return (
      <main className="page">
        <p className="hint">در حال بررسی ورود…</p>
      </main>
    )
  }

  if (!user) {
    return <Navigate to="/login" replace />
  }

  return <>{children(user)}</>
}
