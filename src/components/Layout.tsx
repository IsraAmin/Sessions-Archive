import { NavLink, Outlet } from 'react-router-dom'
import { useAuth } from '../hooks/useAuth'

export function Layout() {
  const { user, isAdmin, signOut } = useAuth()

  return (
    <div className="app-shell">
      <header className="topbar">
        <NavLink to="/" className="brand">Sessions Archive</NavLink>
        <nav className="nav-links" aria-label="التنقل الرئيسي">
          <NavLink to="/">السيشنات</NavLink>
          {user && <NavLink to="/dashboard">لوحتي</NavLink>}
          {user && <NavLink to="/profile">الملف الشخصي</NavLink>}
          {isAdmin && <NavLink to="/admin">الإدارة</NavLink>}
        </nav>
        <div className="auth-actions">
          {user ? (
            <button className="button button-ghost" onClick={() => void signOut()}>خروج</button>
          ) : (
            <NavLink className="button button-primary" to="/auth">دخول</NavLink>
          )}
        </div>
      </header>
      <main className="container"><Outlet /></main>
      <footer className="footer">منصة طلابية لإدارة واكتشاف السيشنات.</footer>
    </div>
  )
}
