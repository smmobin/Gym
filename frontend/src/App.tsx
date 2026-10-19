import { BrowserRouter, Navigate, Route, Routes } from 'react-router-dom'

import { AthleteHomePage } from '@/features/athlete/AthleteHomePage'
import { AthleteLoginPage } from '@/features/athlete/AthleteLoginPage'
import { AttendancePage } from '@/features/attendance/AttendancePage'
import { LoginPage } from '@/features/auth/LoginPage'
import { BillingPage } from '@/features/billing/BillingPage'
import { ClassesPage } from '@/features/classes/ClassesPage'
import { GuestsPage } from '@/features/guests/GuestsPage'
import { LockersPage } from '@/features/lockers/LockersPage'
import { MembersPage } from '@/features/members/MembersPage'
import { ReportsPage } from '@/features/reports/ReportsPage'
import { SettingsPage } from '@/features/settings/SettingsPage'
import { HomePage } from '@/features/shell/HomePage'
import { SmsTemplatesPage } from '@/features/sms/SmsTemplatesPage'
import { TrainersPage } from '@/features/trainers/TrainersPage'
import { TrialLeadsPage } from '@/features/trial/TrialLeadsPage'
import { TrialPublicPage } from '@/features/trial/TrialPublicPage'
import { WorkoutsPage } from '@/features/workouts/WorkoutsPage'

export default function App() {
  return (
    <BrowserRouter>
      <Routes>
        <Route path="/" element={<HomePage />} />
        <Route path="/login" element={<LoginPage />} />
        <Route path="/athlete/login" element={<AthleteLoginPage />} />
        <Route path="/athlete" element={<AthleteHomePage />} />
        <Route path="/trial" element={<TrialPublicPage />} />
        <Route path="/trial-leads" element={<TrialLeadsPage />} />
        <Route path="/guests" element={<GuestsPage />} />
        <Route path="/members" element={<MembersPage />} />
        <Route path="/attendance" element={<AttendancePage />} />
        <Route path="/billing" element={<BillingPage />} />
        <Route path="/reports" element={<ReportsPage />} />
        <Route path="/settings" element={<SettingsPage />} />
        <Route path="/sms-templates" element={<SmsTemplatesPage />} />
        <Route path="/classes" element={<ClassesPage />} />
        <Route path="/lockers" element={<LockersPage />} />
        <Route path="/trainers" element={<TrainersPage />} />
        <Route path="/workouts" element={<WorkoutsPage />} />
        <Route path="*" element={<Navigate to="/" replace />} />
      </Routes>
    </BrowserRouter>
  )
}
