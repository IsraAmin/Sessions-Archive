import { AdminPage } from './AdminPage'
import { AdminUserDirectoryPanel } from '../components/AdminUserDirectoryPanel'

export function AdminWorkspacePage() {
  return <div className="admin-workspace-stack">
    <AdminPage />
    <AdminUserDirectoryPanel />
  </div>
}
