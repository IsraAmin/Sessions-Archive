import { BrowserRouter, Route, Routes } from 'react-router-dom'
import { AuthProvider } from './hooks/useAuth'
import { UiProvider } from './hooks/useUi'
import { ToastProvider } from './components/ToastProvider'
import { Layout } from './components/Layout'
import { ProtectedRoute, AdminRoute } from './components/ProtectedRoute'
import { SessionsPage } from './pages/SessionsPage'
import { SessionDetailsPage } from './pages/SessionDetailsPage'
import { AuthPage } from './pages/AuthPage'
import { ProfilePage } from './pages/ProfilePage'
import { DashboardPage } from './pages/DashboardPage'
import { AdminPageV3 } from './pages/AdminPageV3'
import { AnalyticsPage } from './pages/AnalyticsPage'

const routerBase = import.meta.env.BASE_URL.replace(/\/$/, '') || '/'

export default function App() {
  return <UiProvider>
    <BrowserRouter basename={routerBase}>
      <ToastProvider>
        <AuthProvider>
          <Routes>
            <Route element={<Layout />}>
              <Route index element={<SessionsPage />} />
              <Route path="sessions/:id" element={<SessionDetailsPage />} />
              <Route path="auth" element={<AuthPage />} />
              <Route path="dashboard" element={<ProtectedRoute><DashboardPage /></ProtectedRoute>} />
              <Route path="profile" element={<ProtectedRoute><ProfilePage /></ProtectedRoute>} />
              <Route path="admin" element={<AdminRoute><AdminPageV3 /></AdminRoute>} />
              <Route path="admin/analytics" element={<AdminRoute><AnalyticsPage /></AdminRoute>} />
            </Route>
          </Routes>
        </AuthProvider>
      </ToastProvider>
    </BrowserRouter>
  </UiProvider>
}
