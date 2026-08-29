import { useEffect, useState } from 'react'
import { NavLink, Outlet, useLocation, useNavigate } from 'react-router-dom'
import { useAuth } from '../hooks/useAuth'
import { useUi } from '../hooks/useUi'
import { useToast } from './ToastProvider'
import { PwaInstallPrompt } from './PwaInstallPrompt'
import { NotificationCenter } from './NotificationCenter'
import { ConfirmDialog } from './ConfirmDialog'
import { Icon } from './Icon'

export function Layout() {
  const { user, isAdmin, isSuperAdmin, signOut } = useAuth()
  const { theme, t, language, toggleLanguage, toggleTheme } = useUi()
  const { showToast } = useToast()
  const [sidebarOpen, setSidebarOpen] = useState(false)
  const [logoutConfirm, setLogoutConfirm] = useState(false)
  const [logoutBusy, setLogoutBusy] = useState(false)
  const location = useLocation()
  const navigate = useNavigate()
  const logoUrl = `${import.meta.env.BASE_URL}icon-192.png?v=6`
  const ar = language === 'ar'
  const savedLabel = ar ? 'المحفوظات' : 'Saved'

  useEffect(() => setSidebarOpen(false), [location.pathname])

  const navClass = ({ isActive }: { isActive: boolean }) => `sidebar-link ${isActive ? 'active' : ''}`
  const mobileNavClass = ({ isActive }: { isActive: boolean }) => `mobile-bottom-link ${isActive ? 'active' : ''}`

  async function confirmLogout() {
    setLogoutBusy(true)
    try {
      await signOut()
      setLogoutConfirm(false)
      navigate('/', { replace: true })
    } catch (error) {
      console.error('Sign out failed', error)
      showToast({
        kind: 'error',
        title: t('common.error'),
        message: ar ? 'تعذر تسجيل الخروج. حاولي مرة أخرى.' : 'Could not sign out. Please try again.',
      })
    } finally {
      setLogoutBusy(false)
    }
  }

  return <div className="workspace-shell">
    {sidebarOpen && <button className="sidebar-scrim" aria-label={t('common.close')} onClick={() => setSidebarOpen(false)} />}
    <aside className={`app-sidebar ${sidebarOpen ? 'is-open' : ''}`}>
      <div className="sidebar-brand">
        <NavLink to="/" className="brand-lockup"><span className="brand-mark"><img src={logoUrl} alt="" aria-hidden="true" /></span><span><strong>Sessions</strong><small>Archive</small></span></NavLink>
        <button className="sidebar-close" aria-label={t('common.close')} onClick={() => setSidebarOpen(false)}><Icon name="close" /></button>
      </div>
      <nav className="sidebar-nav" aria-label={t('nav.explore')}>
        <span className="sidebar-label">{t('nav.explore')}</span>
        <NavLink end to="/" className={navClass}><Icon name="home" /><span>{t('nav.sessions')}</span></NavLink>
        {user && <NavLink to="/saved" className={navClass}><Icon name="bookmark" /><span>{savedLabel}</span></NavLink>}
        {user && <NavLink to="/dashboard" className={navClass}><Icon name="dashboard" /><span>{t('nav.dashboard')}</span></NavLink>}
        {isAdmin && <><span className="sidebar-label sidebar-label-spaced">{t('admin.content')}</span><NavLink end to="/admin" className={navClass}><Icon name="shield" /><span>{t('nav.admin')}</span>{isSuperAdmin && <em className="mini-badge">SUPER</em>}</NavLink><NavLink to="/admin/analytics" className={navClass}><Icon name="chart" /><span>{t('admin.analytics')}</span></NavLink></>}
      </nav>
      <div className="sidebar-bottom">
        {user ? <><NavLink to="/profile" className={navClass}><Icon name="user" /><span>{t('nav.profile')}</span></NavLink><button className="sidebar-link sidebar-button sidebar-logout" onClick={() => setLogoutConfirm(true)}><Icon name="logout" /><span>{t('common.signOut')}</span></button><div className="sidebar-user"><span className="sidebar-user-avatar">{(user.user_metadata?.full_name || user.email || 'U').slice(0, 1).toUpperCase()}</span><span><strong>{user.user_metadata?.full_name || user.email}</strong><small>{isSuperAdmin ? t('admin.superAdmin') : isAdmin ? t('admin.roleAdmin') : t('admin.roleStudent')}</small></span></div></> : <NavLink className="button button-primary full" to="/auth">{t('common.signIn')}</NavLink>}
      </div>
    </aside>

    <div className="workspace-main">
      <header className="workspace-topbar">
        <div className="topbar-start"><div className="mobile-brand"><img src={logoUrl} alt="" aria-hidden="true" /><span>Sessions Archive</span></div></div>
        <div className="topbar-controls">
          {user && <NotificationCenter />}
          <button className="top-control control-with-label" onClick={toggleLanguage} title={t('common.language')}><Icon name="language" /><span>{t('common.language')}</span></button>
          <button className="top-control" onClick={toggleTheme} title={theme === 'dark' ? t('common.light') : t('common.dark')} aria-label={theme === 'dark' ? t('common.light') : t('common.dark')}><Icon name={theme === 'dark' ? 'sun' : 'moon'} /></button>
          {user && <button className="top-control mobile-logout" onClick={() => setLogoutConfirm(true)} title={t('common.signOut')} aria-label={t('common.signOut')}><Icon name="logout" /></button>}
        </div>
      </header>
      <main className="workspace-content"><Outlet /></main>
      <PwaInstallPrompt />
    </div>

    <nav className="mobile-bottom-nav" aria-label={t('nav.explore')}>
      <NavLink end to="/" className={mobileNavClass}><Icon name="home" /><span>{t('nav.sessions')}</span></NavLink>
      {user && <NavLink to="/saved" className={mobileNavClass}><Icon name="bookmark" /><span>{savedLabel}</span></NavLink>}
      {user && <NavLink to="/dashboard" className={mobileNavClass}><Icon name="dashboard" /><span>{t('nav.dashboard')}</span></NavLink>}
      {isAdmin && <NavLink end to="/admin" className={mobileNavClass}><Icon name="shield" /><span>{t('nav.admin')}</span></NavLink>}
      {isAdmin && <NavLink to="/admin/analytics" className={mobileNavClass}><Icon name="chart" /><span>{t('admin.analytics')}</span></NavLink>}
      {user ? <NavLink to="/profile" className={mobileNavClass}><Icon name="user" /><span>{t('nav.profile')}</span></NavLink> : <NavLink to="/auth" className={mobileNavClass}><Icon name="user" /><span>{t('common.signIn')}</span></NavLink>}
    </nav>

    <ConfirmDialog open={logoutConfirm} title={ar ? 'تسجيل الخروج؟' : 'Sign out?'} description={ar ? 'هل أنتِ متأكدة من تسجيل الخروج من حسابك؟ يمكنك تسجيل الدخول مرة أخرى في أي وقت.' : 'Are you sure you want to sign out? You can sign in again at any time.'} confirmLabel={ar ? 'نعم، تسجيل الخروج' : 'Yes, sign out'} cancelLabel={ar ? 'البقاء في الحساب' : 'Stay signed in'} tone="danger" busy={logoutBusy} onCancel={() => !logoutBusy && setLogoutConfirm(false)} onConfirm={() => void confirmLogout()} />
  </div>
}
