import { BrowserRouter, Navigate, Route, Routes } from 'react-router-dom'

import { AttendancePage } from '@/features/attendance/AttendancePage'
import { LoginPage } from '@/features/auth/LoginPage'
import { BillingPage } from '@/features/billing/BillingPage'
import { ClassesPage } from '@/features/classes/ClassesPage'
import { LockersPage } from '@/features/lockers/LockersPage'
import { MembersPage } from '@/features/members/MembersPage'
import { HomePage } from '@/features/shell/HomePage'
import { TrainersPage } from '@/features/trainers/TrainersPage'
import { WorkoutsPage } from '@/features/workouts/WorkoutsPage'

export default function App() {
  return (
    <BrowserRouter>
      <Routes>
        <Route path="/" element={<HomePage />} />
        <Route path="/login" element={<LoginPage />} />
        <Route path="/members" element={<MembersPage />} />
        <Route path="/attendance" element={<AttendancePage />} />
        <Route path="/billing" element={<BillingPage />} />
        <Route path="/classes" element={<ClassesPage />} />
        <Route path="/lockers" element={<LockersPage />} />
        <Route path="/trainers" element={<TrainersPage />} />
        <Route path="/workouts" element={<WorkoutsPage />} />
        <Route path="*" element={<Navigate to="/" replace />} />
      </Routes>
    </BrowserRouter>
  )
}
