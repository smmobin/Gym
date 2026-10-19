export type StaffNotification = {
  id: number
  kind: string
  title: string
  body: string | null
  role_audience: string
  entity_type: string | null
  entity_id: string | null
  is_derived: boolean
  is_read: boolean
  created_at: string
  href: string | null
}

export type NotificationListResponse = {
  items: StaffNotification[]
  total: number
  unread_count: number
}
