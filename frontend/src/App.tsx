import { BrowserRouter, Navigate, Route, Routes } from 'react-router-dom'

import { AttendancePage } from '@/features/attendance/AttendancePage'
import { LoginPage } from '@/features/auth/LoginPage'
import { BillingPage } from '@/features/billing/BillingPage'
import { ClassesPage } from '@/features/classes/ClassesPage'
import { MembersPage } from '@/features/members/MembersPage'
import { HomePage } from '@/features/shell/HomePage'

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
        <Route path="*" element={<Navigate to="/" replace />} />
      </Routes>
    </BrowserRouter>
  )
}
