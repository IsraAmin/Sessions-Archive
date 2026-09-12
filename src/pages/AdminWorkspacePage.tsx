import { useEffect, useState } from 'react'
import { useLocation } from 'react-router-dom'
import { AdminPage } from './AdminPage'
import { AdminUserDirectoryPanel } from '../components/AdminUserDirectoryPanel'
import { AdminActivityLog } from '../components/AdminActivityLog'
import { AdminBackupRestorePanel } from '../components/AdminBackupRestorePanel'
import { AdminEventsPanel } from '../components/AdminEventsPanel'
import { AdminCompetitionsWorkspace } from '../components/AdminCompetitionsWorkspace'
import { AdminEventCreateWizard } from '../components/AdminEventCreateWizard'
import { Icon } from '../components/Icon'
import { useAuth } from '../hooks/useAuth'
import { useUi } from '../hooks/useUi'

type AdminWorkspaceTab = 'sessions' | 'events' | 'system'
type EventsWorkspaceMode = 'events' | 'competitions'

export function AdminWorkspacePage() {
  const { isSuperAdmin } = useAuth()
  const { language } = useUi()
  const location = useLocation()
  const ar = language === 'ar'
  const [tab, setTab] = useState<AdminWorkspaceTab>('sessions')
  const [eventsMode, setEventsMode] = useState<EventsWorkspaceMode>('events')
  const [eventsVersion, setEventsVersion] = useState(0)
  const [lastCreatedEventId, setLastCreatedEventId] = useState('')

  useEffect(() => {
    const hash = location.hash.toLowerCase()
    if (hash.includes('competition')) {
      setTab('events')
      setEventsMode('competitions')
    } else if (hash.includes('events')) {
      setTab('events')
      setEventsMode('events')
    } else if (hash.includes('backup') || hash.includes('activity') || hash.includes('users')) setTab('system')
  }, [location.hash])

  function choose(next: AdminWorkspaceTab) {
    setTab(next)
    const hash = next === 'events' ? (eventsMode === 'competitions' ? '#competitions-admin' : '#events-admin') : next === 'system' ? '#admin-system' : '#sessions-admin'
    window.history.replaceState(null, '', `${location.pathname}${location.search}${hash}`)
    window.scrollTo({ top: 0, behavior: 'smooth' })
  }

  function chooseEventsMode(next: EventsWorkspaceMode) {
    setEventsMode(next)
    const hash = next === 'competitions' ? '#competitions-admin' : '#events-admin'
    window.history.replaceState(null, '', `${location.pathname}${location.search}${hash}`)
    window.scrollTo({ top: 0, behavior: 'smooth' })
  }

  function handleEventCreated(eventId: string, isCompetition: boolean) {
    const nextMode: EventsWorkspaceMode = isCompetition ? 'competitions' : 'events'
    setLastCreatedEventId(eventId)
    setEventsVersion((version) => version + 1)
    setEventsMode(nextMode)
    const hash = nextMode === 'competitions' ? '#competitions-admin' : '#events-admin'
    window.history.replaceState(null, '', `${location.pathname}${location.search}${hash}`)
    window.setTimeout(() => window.scrollTo({ top: 0, behavior: 'smooth' }), 0)
  }

  return <div className="admin-workspace-stack admin-workspace-v2">
    <section className="admin-workspace-switcher" aria-label={ar ? 'أقسام الإدارة' : 'Admin sections'}>
      <div className="admin-workspace-switcher-copy">
        <span className="eyebrow">{ar ? 'إدارة المنصة' : 'Platform management'}</span>
        <h1>{ar ? 'كل نوع محتوى عنده مساحة واضحة' : 'A clear workspace for every content type'}</h1>
        <p>{ar ? 'بدل صفحة طويلة ومزدحمة، اختاري القسم الذي تريدين العمل عليه فقط.' : 'Instead of one long crowded page, open only the workspace you need.'}</p>
      </div>
      <div className="admin-workspace-tabs" role="tablist">
        <button type="button" role="tab" aria-selected={tab === 'sessions'} className={tab === 'sessions' ? 'active' : ''} onClick={() => choose('sessions')}><Icon name="calendar" /><span><strong>{ar ? 'السيشنات' : 'Sessions'}</strong><small>{ar ? 'المحتوى التعليمي' : 'Learning content'}</small></span></button>
        <button type="button" role="tab" aria-selected={tab === 'events'} className={tab === 'events' ? 'active' : ''} onClick={() => choose('events')}><Icon name="layers" /><span><strong>{ar ? 'الفعاليات' : 'Events'}</strong><small>{ar ? 'الصور والفيديوهات' : 'Photos & videos'}</small></span></button>
        <button type="button" role="tab" aria-selected={tab === 'system'} className={tab === 'system' ? 'active' : ''} onClick={() => choose('system')}><Icon name="shield" /><span><strong>{ar ? 'النظام' : 'System'}</strong><small>{ar ? 'المستخدمون والنسخ الاحتياطي' : 'Users & backup'}</small></span></button>
      </div>
    </section>

    {tab === 'sessions' && <div id="sessions-admin" role="tabpanel"><AdminPage /></div>}
    {tab === 'events' && <div className="admin-events-mode-stack" role="tabpanel">
      <div className="admin-events-mode-switcher" role="tablist" aria-label={ar ? 'نوع إدارة الفعاليات' : 'Events management mode'}>
        <button type="button" role="tab" aria-selected={eventsMode === 'events'} className={eventsMode === 'events' ? 'active' : ''} onClick={() => chooseEventsMode('events')}><span>01</span><div><strong>{ar ? 'الفعاليات' : 'Events'}</strong><small>{ar ? 'البيانات، الغلاف والألبوم' : 'Details, cover & album'}</small></div></button>
        <button type="button" role="tab" aria-selected={eventsMode === 'competitions'} className={eventsMode === 'competitions' ? 'active' : ''} onClick={() => chooseEventsMode('competitions')}><span>02</span><div><strong>{ar ? 'المسابقات الأكاديمية' : 'Academic competitions'}</strong><small>{ar ? 'التسجيل، المراحل والنتائج' : 'Registration, stages & results'}</small></div></button>
      </div>
      <AdminEventCreateWizard onCreated={handleEventCreated} />
      {eventsMode === 'events'
        ? <AdminEventsPanel key={`events-${eventsVersion}`} />
        : <AdminCompetitionsWorkspace key={`competitions-${eventsVersion}`} preferredEventId={lastCreatedEventId} />}
    </div>}
    {tab === 'system' && <div className="admin-system-stack" id="admin-system" role="tabpanel">
      {isSuperAdmin && <AdminBackupRestorePanel />}
      {isSuperAdmin && <AdminActivityLog />}
      <AdminUserDirectoryPanel />
    </div>}
  </div>
}
