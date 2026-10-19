export type ExpenseCategory = 'rent' | 'salary' | 'purchase' | 'utilities' | 'other'

export type ExpenseRow = {
  id: number
  category: ExpenseCategory | string
  amount_toman: number
  expense_date: string
  note: string | null
  created_by_user_id: number | null
  created_at: string
}

export type ExpenseListResponse = {
  items: ExpenseRow[]
  total: number
  from: string
  to: string
  expenses_toman: number
}

export type ProfitReportResponse = {
  from: string
  to: string
  income_paid_toman: number
  expenses_toman: number
  profit_toman: number
  note: string
}
