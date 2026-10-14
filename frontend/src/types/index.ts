export type UserRole = 'manager' | 'receptionist' | 'trainer' | 'member'

export type MemberStatus = 'active' | 'expired' | 'pending'

export interface HealthResponse {
  status: string
  database?: string
}
