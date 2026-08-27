import type { ReactNode } from 'react'
import { Navigate } from 'react-router-dom'
import { useAuth } from '../hooks/useAuth'

export function ProtectedRoute({ children }: { children: ReactNode }) {
  const { user, loading } = useAuth()
  if (loading) return <div className="page-state">جاري التحميل…</div>
  if (!user) return <Navigate to="/auth" replace />
  return children
}

export function AdminRoute({ children }: { children: ReactNode }) {
  const { user, loading, isAdmin } = useAuth()
  if (loading) return <div className="page-state">جاري التحميل…</div>
  if (!user) return <Navigate to="/auth" replace />
  if (!isAdmin) return <Navigate to="/" replace />
  return children
}
