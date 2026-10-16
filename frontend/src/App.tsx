import { BrowserRouter, Navigate, Route, Routes } from 'react-router-dom'

import { LoginPage } from '@/features/auth/LoginPage'
import { MembersPage } from '@/features/members/MembersPage'
import { HomePage } from '@/features/shell/HomePage'

export default function App() {
  return (
    <BrowserRouter>
      <Routes>
        <Route path="/" element={<HomePage />} />
        <Route path="/login" element={<LoginPage />} />
        <Route path="/members" element={<MembersPage />} />
        <Route path="*" element={<Navigate to="/" replace />} />
      </Routes>
    </BrowserRouter>
  )
}
