export type MemberLockStatus = {
  locked: boolean
  member_id: number
  locked_by: number | null
  locked_by_name: string | null
  locked_by_mobile: string | null
  acquired_at: string | null
  last_seen_at: string | null
  expires_at: string | null
  held_by_me: boolean
}

export type MemberLockConflict = {
  code?: string
  message?: string
  locked_by?: number
  locked_by_name?: string
  locked_by_mobile?: string
  expires_at?: string
}
