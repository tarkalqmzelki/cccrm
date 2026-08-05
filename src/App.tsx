import { BrowserRouter, Navigate, Route, Routes } from 'react-router-dom'
import type { ReactNode } from 'react'
import { AuthProvider, useAuth } from './context/AuthContext'
import { ToastProvider } from './context/ToastContext'
import { AppShell } from './components/layout/AppShell'
import { ContextMenuHost } from './components/ui/ContextMenu'
import Login from './pages/Login'
import Dashboard from './pages/Dashboard'
import Deals from './pages/Deals'
import DealDetail from './pages/DealDetail'
import Leaderboard from './pages/Leaderboard'
import Referrals from './pages/Referrals'
import Payouts from './pages/Payouts'
import Sellers from './pages/admin/Sellers'
import SettingsPage from './pages/admin/Settings'
import CreateUser from './pages/admin/CreateUser'
import Leads from './pages/Leads'
import CompanyDetail from './pages/CompanyDetail'
import OpportunityDetail from './pages/OpportunityDetail'
import type { Role } from './lib/types'

function Protected({ children, roles }: { children: ReactNode; roles?: Role[] }) {
  const { user, loading } = useAuth()
  if (loading) return <FullLoader />
  if (!user) return <Navigate to="/login" replace />
  if (roles && !roles.includes(user.role)) return <Navigate to="/" replace />
  return <>{children}</>
}

function FullLoader() {
  return (
    <div className="min-h-dvh flex items-center justify-center bg-canvas">
      <div className="flex flex-col items-center gap-3">
        <div className="skeleton h-10 w-10 rounded-xl" />
        <div className="skeleton h-3 w-24 rounded" />
      </div>
    </div>
  )
}

function Shell() {
  return (
    <AppShell>
      <Routes>
        <Route path="/" element={<Dashboard />} />
        <Route path="/leads" element={<Leads />} />
        <Route path="/leads/:id" element={<CompanyDetail />} />
        <Route path="/leads/opp/:id" element={<OpportunityDetail />} />
        <Route path="/deals" element={<Deals />} />
        <Route path="/deals/:id" element={<DealDetail />} />
        <Route path="/leaderboard" element={<Leaderboard />} />
        <Route path="/referrals" element={<Referrals />} />
        <Route path="/payouts" element={<Payouts />} />
        <Route path="/sellers" element={<Protected roles={['admin']}><Sellers /></Protected>} />
        <Route path="/create-user" element={<Protected roles={['admin']}><CreateUser /></Protected>} />
        <Route path="/settings" element={<Protected roles={['admin']}><SettingsPage /></Protected>} />
        <Route path="*" element={<Navigate to="/" replace />} />
      </Routes>
    </AppShell>
  )
}

export default function App() {
  return (
    <AuthProvider>
      <ToastProvider>
        <BrowserRouter>
          <Routes>
            <Route path="/login" element={<Login />} />
            <Route
              path="/*"
              element={
                <Protected>
                  <Shell />
                </Protected>
              }
            />
          </Routes>
          <ContextMenuHost />
        </BrowserRouter>
      </ToastProvider>
    </AuthProvider>
  )
}
