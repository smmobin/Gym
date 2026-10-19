export type GenderLabel = 'men' | 'women' | 'mixed'

export type GroupClass = {
  id: number
  title: string
  trainer_user_id: number | null
  capacity: number
  booked_count: number
  remaining: number
  gender_label: GenderLabel | string
  starts_at: string
  ends_at: string
  is_active: boolean
  trainer_schedule_conflict?: boolean
}

export type GroupClassListResponse = {
  items: GroupClass[]
  total: number
}

export type GroupClassMutationResponse = {
  group_class: GroupClass
  trainer_schedule_conflict: boolean
  warning: string | null
}

export type ClassBooking = {
  id: number
  group_class_id: number
  member_id: number
  member_display_id: string | null
  member_name: string | null
  status: string
  created_at: string
  cancelled_at: string | null
}

export type BookingListResponse = {
  items: ClassBooking[]
  total: number
  booked_count: number
  remaining: number
}

export type BookingMutationResponse = {
  booking: ClassBooking
  booked_count: number
  remaining: number
}
