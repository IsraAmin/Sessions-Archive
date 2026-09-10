import { AdminPage } from './AdminPage'
import { AdminUserDirectoryPanel } from '../components/AdminUserDirectoryPanel'
import { AdminActivityLog } from '../components/AdminActivityLog'
import { AdminBackupRestorePanel } from '../components/AdminBackupRestorePanel'
import { AdminEventsPanel } from '../components/AdminEventsPanel'
import { Icon } from '../components/Icon'
import { useAuth } from '../hooks/useAuth'
import { useUi } from '../hooks/useUi'

export function AdminWorkspacePage() {
  const { isSuperAdmin } = useAuth()
  const { language } = useUi()
  const ar = language === 'ar'

  return <div className="admin-workspace-stack">
    <section className="admin-content-launcher">
      <div><span className="eyebrow">{ar ? 'إضافة محتوى' : 'Add content'}</span><h2>{ar ? 'شنو عايز تضيف؟' : 'What would you like to add?'}</h2><p>{ar ? 'السيشنات تظل بنظامها الحالي، والفعاليات لها ألبوم صور وفيديوهات مستقل.' : 'Sessions keep their current workflow, while events have their own photo and video album.'}</p></div>
      <div className="admin-content-launcher-actions"><a href="#sessions-admin"><Icon name="calendar" /><span><strong>{ar ? 'سيشن' : 'Session'}</strong><small>{ar ? 'المحتوى التعليمي والتسجيلات' : 'Learning content and recordings'}</small></span></a><a href="#events-admin"><Icon name="layers" /><span><strong>{ar ? 'فعالية' : 'Event'}</strong><small>{ar ? 'صور، فيديوهات وذكريات الكلية' : 'Photos, videos and college memories'}</small></span></a></div>
    </section>
    <div id="sessions-admin"><AdminPage /></div>
    <AdminEventsPanel />
    {isSuperAdmin && <AdminBackupRestorePanel />}
    {isSuperAdmin && <AdminActivityLog />}
    <AdminUserDirectoryPanel />
  </div>
}
