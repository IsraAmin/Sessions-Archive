import { AdminPage } from './AdminPage'
import { AdminUserDirectoryPanel } from '../components/AdminUserDirectoryPanel'
import { AdminActivityLog } from '../components/AdminActivityLog'
import { AdminBackupRestorePanel } from '../components/AdminBackupRestorePanel'
import { useAuth } from '../hooks/useAuth'

export function AdminWorkspacePage() {
  const { isSuperAdmin } = useAuth()

  return <div className="admin-workspace-stack">
    <AdminPage />
    {isSuperAdmin && <AdminBackupRestorePanel />}
    {isSuperAdmin && <AdminActivityLog />}
    <AdminUserDirectoryPanel />
  </div>
}
