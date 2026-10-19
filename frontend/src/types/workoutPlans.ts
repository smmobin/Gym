export type WorkoutPlan = {
  id: number
  member_id: number
  trainer_user_id: number
  trainer_full_name: string | null
  title: string
  body: string | null
  created_at: string
  updated_at: string | null
}

export type WorkoutPlanListResponse = {
  member_id: number
  items: WorkoutPlan[]
  total: number
}
