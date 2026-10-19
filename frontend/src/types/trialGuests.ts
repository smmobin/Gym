export type TrialLeadStatus = 'new' | 'contacted' | 'converted' | 'closed'

export type TrialLead = {
  id: number
  full_name: string
  mobile: string
  preferred_time_note: string | null
  message: string | null
  status: TrialLeadStatus | string
  created_at: string
  updated_at: string | null
}

export type TrialLeadListResponse = {
  items: TrialLead[]
  total: number
}

export type DayGuestResponse = {
  member: {
    id: number
    display_id: string
    first_name: string
    last_name: string
    mobile: string
    status: string
  }
  membership: {
    id: number
    plan_id: number
    plan_name: string | null
    agreed_amount_toman: number
    start_date: string
    end_date: string
    status: string
  }
  payment: {
    id: number
    receipt_number: string
    amount_toman: number
    method: string
    status: string
  } | null
  reused_existing_member: boolean
  message: string
}
