export type AttendanceType = 'gym' | 'class' | 'pt'

export type Attendance = {
  id: number
  member_id: number
  membership_id?: number | null
  check_in_at: string
  check_out_at?: string | null
  attendance_type: string
  recorded_by_user_id?: number | null
  is_open: boolean
}

export type CheckInResponse = {
  attendance: Attendance
  debt_toman: number
  debt_warning?: string | null
  sessions_remaining?: number | null
  auto_closed_attendance_ids: number[]
}

export type TodayAttendancesResponse = {
  items: Attendance[]
  total: number
  auto_closed_attendance_ids: number[]
}
