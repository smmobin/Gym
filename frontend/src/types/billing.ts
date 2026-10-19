export type MembershipPlan = {
  id: number
  name: string
  description: string | null
  duration_days: number | null
  session_count: number | null
  base_price_toman: number
  includes_locker: boolean
  is_active: boolean
}

export type MembershipPlanListResponse = {
  items: MembershipPlan[]
  total: number
}

export type MembershipRow = {
  id: number
  member_id: number
  plan_id: number
  plan_name: string | null
  agreed_amount_toman: number
  start_date: string
  end_date: string
  status: string
  sessions_remaining: number | null
  notes: string | null
  created_at: string
}

export type MembershipListResponse = {
  items: MembershipRow[]
  total: number
  debt_toman: number
}

export type PaymentRow = {
  id: number
  member_id: number
  membership_id: number | null
  amount_toman: number
  method: string
  status: string
  receipt_number: string
  title: string | null
  note: string | null
  paid_at: string | null
  created_by_user_id: number | null
  created_at: string
  status_changed_at: string | null
}

export type PaymentListResponse = {
  items: PaymentRow[]
  total: number
  debt_toman: number
}

export type PaymentMutationResponse = {
  payment: PaymentRow
  debt_toman: number
}

export type RenewMembershipResponse = {
  membership: MembershipRow
  debt_toman: number
  base_membership_id: number | null
}

export type PaymentMethod = 'cash' | 'pos' | 'transfer' | 'online'
