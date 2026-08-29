import { AdminPage } from './AdminPage'
import { AdminUserDirectoryPanel } from '../components/AdminUserDirectoryPanel'
import { AdminActivityLog } from '../components/AdminActivityLog'
import { useAuth } from '../hooks/useAuth'

export function AdminWorkspacePage() {
  const { isSuperAdmin } = useAuth()

  return <div className="admin-workspace-stack">
    <AdminPage />
    {isSuperAdmin && <AdminActivityLog />}
    <AdminUserDirectoryPanel />
  </div>
}
