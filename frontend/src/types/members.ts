export type Member = {
  id: number
  display_id: string
  first_name: string
  last_name: string
  mobile: string
  birth_date?: string | null
  notes?: string | null
  status: string
  archived_at?: string | null
  created_at: string
}

export type MemberListResponse = {
  items: Member[]
  total: number
}

export type MemberCreatePayload = {
  first_name: string
  last_name: string
  mobile: string
  birth_date?: string | null
  notes?: string | null
}
