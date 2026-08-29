import { AdminPage } from './AdminPage'
import { AdminUserDirectoryPanel } from '../components/AdminUserDirectoryPanel'
import { AdminActivityLog } from '../components/AdminActivityLog'
import { SessionSpeakersManager } from '../components/SessionSpeakersManager'
import { useAuth } from '../hooks/useAuth'

export function AdminWorkspacePage() {
  const { isSuperAdmin } = useAuth()

  return <div className="admin-workspace-stack">
    <SessionSpeakersManager />
    <AdminPage />
    {isSuperAdmin && <AdminActivityLog />}
    <AdminUserDirectoryPanel />
  </div>
}
