import { useCallback, useEffect, useRef, useState } from 'react'

import { ApiError, apiGet, apiPost } from '@/lib/api'
import { formatMemberLockConflict } from '@/lib/memberLock'
import type { MemberLockStatus } from '@/types/memberLocks'

const TOUCH_INTERVAL_MS = 60_000

type UseMemberFileLockResult = {
  lock: MemberLockStatus | null
  lockError: string | null
  lockHeldByMe: boolean
  busy: boolean
  release: () => Promise<void>
  clearError: () => void
}

export function useMemberFileLock(memberId: number | null): UseMemberFileLockResult {
  const [lock, setLock] = useState<MemberLockStatus | null>(null)
  const [lockError, setLockError] = useState<string | null>(null)
  const [busy, setBusy] = useState(false)
  const heldIdRef = useRef<number | null>(null)
  const touchTimerRef = useRef<ReturnType<typeof setInterval> | null>(null)

  const stopTouch = useCallback(() => {
    if (touchTimerRef.current) {
      clearInterval(touchTimerRef.current)
      touchTimerRef.current = null
    }
  }, [])

  const release = useCallback(async () => {
    stopTouch()
    const id = heldIdRef.current
    if (id == null) {
      setLock(null)
      return
    }
    heldIdRef.current = null
    try {
      await apiPost<MemberLockStatus>(`/api/v1/members/${id}/unlock`)
    } catch {
      // best-effort unlock on leave
    }
    setLock(null)
  }, [stopTouch])

  useEffect(() => {
    let cancelled = false

    async function acquire(id: number) {
      setBusy(true)
      setLockError(null)
      try {
        const data = await apiPost<MemberLockStatus>(`/api/v1/members/${id}/lock`)
        if (cancelled) {
          await apiPost(`/api/v1/members/${id}/unlock`).catch(() => undefined)
          return
        }
        heldIdRef.current = id
        setLock(data)
        stopTouch()
        touchTimerRef.current = setInterval(() => {
          void apiPost<MemberLockStatus>(`/api/v1/members/${id}/lock/touch`)
            .then((fresh) => {
              if (!cancelled) setLock(fresh)
            })
            .catch((err) => {
              if (cancelled) return
              if (err instanceof ApiError) {
                setLockError(formatMemberLockConflict(err.detail) ?? err.message)
              }
            })
        }, TOUCH_INTERVAL_MS)
      } catch (err) {
        if (cancelled) return
        heldIdRef.current = null
        setLock(null)
        if (err instanceof ApiError) {
          setLockError(formatMemberLockConflict(err.detail) ?? err.message)
          try {
            const status = await apiGet<MemberLockStatus>(`/api/v1/members/${id}/lock`)
            if (!cancelled) setLock(status)
          } catch {
            // ignore
          }
        } else {
          setLockError('گرفتن قفل پرونده ناموفق بود.')
        }
      } finally {
        if (!cancelled) setBusy(false)
      }
    }

    if (memberId == null) {
      stopTouch()
      const prev = heldIdRef.current
      if (prev != null) {
        heldIdRef.current = null
        void apiPost(`/api/v1/members/${prev}/unlock`).catch(() => undefined)
      }
      setLock(null)
      setLockError(null)
      return () => {
        cancelled = true
      }
    }

    const previous = heldIdRef.current
    if (previous != null && previous !== memberId) {
      stopTouch()
      void apiPost(`/api/v1/members/${previous}/unlock`).catch(() => undefined)
      heldIdRef.current = null
    }

    void acquire(memberId)

    return () => {
      cancelled = true
      stopTouch()
      const id = heldIdRef.current
      if (id != null) {
        heldIdRef.current = null
        void apiPost(`/api/v1/members/${id}/unlock`).catch(() => undefined)
      }
    }
  }, [memberId, stopTouch])

  return {
    lock,
    lockError,
    lockHeldByMe: Boolean(lock?.held_by_me),
    busy,
    release,
    clearError: () => setLockError(null),
  }
}
