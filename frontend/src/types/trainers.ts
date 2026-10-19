export type Trainer = {
  id: number
  full_name: string
  mobile: string
  is_active: boolean
}

export type TrainerListResponse = {
  items: Trainer[]
  total: number
}

export type TrainerAssignment = {
  id: number
  trainer_user_id: number
  trainer_full_name: string | null
  trainer_mobile: string | null
  member_id: number
  assigned_at: string
  ended_at: string | null
  is_active: boolean
}

export type AssignmentListResponse = {
  member_id: number
  items: TrainerAssignment[]
  total: number
}

export type AssignTrainerResponse = {
  assignment: TrainerAssignment
}

export type EndAssignmentResponse = {
  assignment: TrainerAssignment
}
