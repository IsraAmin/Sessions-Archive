import type { ReactNode } from 'react'
import { Navigate, useLocation } from 'react-router-dom'
import { useAuth } from '../hooks/useAuth'
import { useUi } from '../hooks/useUi'

export function ProtectedRoute({ children }: { children: ReactNode }) {
  const { user, loading } = useAuth()
  const { t } = useUi()
  const location = useLocation()

  if (loading) return <div className="page-state">{t('common.loading')}</div>

  if (!user) {
    const next = `${location.pathname}${location.search}${location.hash}`
    const params = new URLSearchParams({ mode: 'signup', reason: 'content', next })
    return <Navigate to={`/auth?${params.toString()}`} replace />
  }

  return children
}

export function AdminRoute({ children }: { children: ReactNode }) {
  const { user, loading, isAdmin } = useAuth()
  const { t } = useUi()
  if (loading) return <div className="page-state">{t('common.loading')}</div>
  if (!user) return <Navigate to="/auth" replace />
  if (!isAdmin) return <Navigate to="/" replace />
  return children
}
