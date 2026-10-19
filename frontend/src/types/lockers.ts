export type LockerAssignment = {
  id: number
  member_id: number
  member_display_id: string | null
  member_name: string | null
  membership_id: number | null
  assigned_at: string
  released_at: string | null
  note: string | null
}

export type Locker = {
  id: number
  code: string
  is_active: boolean
  is_free: boolean
  current_assignment: LockerAssignment | null
}

export type LockerListResponse = {
  items: Locker[]
  total: number
}

export type AssignResponse = {
  locker: Locker
  assignment: LockerAssignment
}

export type ReleaseResponse = {
  locker: Locker
  assignment: LockerAssignment
}
