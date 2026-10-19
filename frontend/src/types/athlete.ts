export type AthleteMember = {
  id: number
  display_id: string
  first_name: string
  last_name: string
  mobile: string
  status: string
}

export type AthleteMembership = {
  id: number
  plan_id: number
  plan_name: string | null
  agreed_amount_toman: number
  start_date: string
  end_date: string
  status: string
  sessions_remaining: number | null
}

export type AthleteMembershipsResponse = {
  items: AthleteMembership[]
  total: number
  debt_toman: number
}

export type AthletePayment = {
  id: number
  amount_toman: number
  method: string
  status: string
  receipt_number: string | null
  paid_at: string | null
  created_at: string
  membership_id: number | null
}

export type AthletePaymentsResponse = {
  items: AthletePayment[]
  total: number
}

export type AthleteWorkoutPlan = {
  id: number
  title: string
  body: string | null
  trainer_full_name: string | null
  created_at: string
  updated_at: string | null
}

export type AthleteWorkoutPlansResponse = {
  items: AthleteWorkoutPlan[]
  total: number
}

export type AthleteNotification = {
  id: number
  kind: string
  title: string
  body: string | null
  entity_type: string | null
  entity_id: string | null
  is_read: boolean
  created_at: string
}

export type AthleteNotificationListResponse = {
  items: AthleteNotification[]
  total: number
  unread_count: number
}

export type AthleteGroupClass = {
  id: number
  title: string
  trainer_user_id: number | null
  trainer_full_name: string | null
  capacity: number
  booked_count: number
  remaining: number
  gender_label: string
  starts_at: string
  ends_at: string
  is_active: boolean
  booked_by_me: boolean
  my_booking_id: number | null
}

export type AthleteGroupClassListResponse = {
  items: AthleteGroupClass[]
  total: number
}

export type AthleteClassBooking = {
  id: number
  group_class_id: number
  class_title: string | null
  status: string
  starts_at: string | null
  ends_at: string | null
  created_at: string
}

export type AthleteBookClassResponse = {
  booking: AthleteClassBooking
  booked_count: number
  remaining: number
}
