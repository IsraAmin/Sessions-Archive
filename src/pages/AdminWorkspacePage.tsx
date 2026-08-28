import { AdminPage } from './AdminPage'
import { AdminUserDirectoryPanel } from '../components/AdminUserDirectoryPanel'
import { AdminActivityLog } from '../components/AdminActivityLog'

export function AdminWorkspacePage() {
  return <div className="admin-workspace-stack">
    <AdminPage />
    <AdminActivityLog />
    <AdminUserDirectoryPanel />
  </div>
}
