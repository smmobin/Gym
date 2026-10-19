export type GymSettings = {
  id: number
  gym_name: string
  phone: string | null
  address: string | null
  day_end_time: string
  expiry_warning_days: number
  freeze_annual_cap_days: number
  working_hours_note: string | null
  renewal_rules_note: string | null
  updated_at: string | null
  created_at: string
}
