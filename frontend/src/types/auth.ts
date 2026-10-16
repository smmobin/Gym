export type StaffUser = {
  id: number
  mobile: string
  full_name: string
  role: string
  is_active: boolean
}

export type MeResponse = {
  user: StaffUser
}

export type LoginResponse = {
  user: StaffUser
}
