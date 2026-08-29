import { useEffect, useMemo, useState } from 'react'
import { Icon } from './Icon'
import { useUi } from '../hooks/useUi'
import { errorMessage } from '../lib/errors'
import { supabase } from '../lib/supabase'

type ActivityAction = 'created' | 'updated' | 'deleted' | 'notification_sent' | 'user_role_changed' | 'user_banned' | 'user_unbanned'
type EntityType = 'category' | 'speaker' | 'series' | 'session' | 'video' | 'resource' | 'notification' | 'user'
type ActivityRow = {
  id: string
  actor_user_id: string | null
  action: ActivityAction
  entity_type: EntityType
  entity_id: string | null
  entity_label: string
  details: Record<string, unknown> | null
  created_at: string
}
type ProfileName = { id: string; full_name: string }
type DirectoryName = { id: string; email: string }

export function AdminActivityLog() {
  const { language, locale } = useUi()
  const [rows, setRows] = useState<ActivityRow[]>([])
  const [profiles, setProfiles] = useState<ProfileName[]>([])
  const [directory, setDirectory] = useState<DirectoryName[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')
  const ar = language === 'ar'

  useEffect(() => {
    setLoading(true)
    setError('')
    const activityQuery = (supabase as any)
      .from('admin_activity_log')
      .select('id,actor_user_id,action,entity_type,entity_id,entity_label,details,created_at')
      .order('created_at', { ascending: false })
      .limit(150)
    const directoryQuery = (supabase as any)
      .from('user_directory')
      .select('id,email')

    void Promise.all([
      activityQuery,
      supabase.from('profiles').select('id,full_name'),
      directoryQuery,
    ]).then(([activityResult, profileResult, directoryResult]) => {
      const firstError = activityResult.error || profileResult.error || directoryResult.error
      if (firstError) {
        setError(errorMessage(firstError))
        return
      }
      setRows((activityResult.data ?? []) as ActivityRow[])
      setProfiles((profileResult.data ?? []) as ProfileName[])
      setDirectory((directoryResult.data ?? []) as DirectoryName[])
    }).catch((reason) => setError(errorMessage(reason)))
      .finally(() => setLoading(false))
  }, [])

  const actors = useMemo(() => {
    const names = new Map<string, { name: string; email: string }>()
    for (const account of directory) names.set(account.id, { name: account.email, email: account.email })
    for (const profile of profiles) {
      const current = names.get(profile.id)
      if (profile.full_name.trim()) names.set(profile.id, { name: profile.full_name.trim(), email: current?.email ?? '' })
    }
    return names
  }, [directory, profiles])

  function entityLabel(type: EntityType) {
    const labels: Record<EntityType, [string, string]> = {
      category: ['تصنيف', 'category'],
      speaker: ['متحدث', 'speaker'],
      series: ['سلسلة', 'series'],
      session: ['سيشن', 'session'],
      video: ['تسجيل', 'recording'],
      resource: ['ملف سيشن', 'session resource'],
      notification: ['إشعار', 'notification'],
      user: ['مستخدم', 'user'],
    }
    return labels[type][ar ? 0 : 1]
  }

  function actionLabel(row: ActivityRow) {
    const entity = entityLabel(row.entity_type)
    if (row.action === 'created') return ar ? `أضاف ${entity}` : `Added ${entity}`
    if (row.action === 'updated') return ar ? `عدّل ${entity}` : `Updated ${entity}`
    if (row.action === 'deleted') return ar ? `حذف ${entity}` : `Deleted ${entity}`
    if (row.action === 'notification_sent') return ar ? 'أرسل إشعارًا' : 'Sent a notification'
    if (row.action === 'user_role_changed') return ar ? 'غيّر صلاحية مستخدم' : 'Changed a user role'
    if (row.action === 'user_banned') return ar ? 'حظر مستخدمًا' : 'Disabled a user'
    return ar ? 'أعاد تفعيل مستخدم' : 'Re-enabled a user'
  }

  function actionIcon(action: ActivityAction): 'check' | 'layers' | 'error' | 'bell' | 'users' {
    if (action === 'created') return 'check'
    if (action === 'updated') return 'layers'
    if (action === 'deleted') return 'error'
    if (action === 'notification_sent') return 'bell'
    return 'users'
  }

  function detailText(row: ActivityRow) {
    if (row.action === 'user_role_changed') {
      const role = row.details?.new_role
      if (role === 'admin') return ar ? 'الصلاحية الجديدة: Admin' : 'New role: Admin'
      if (role === 'student') return ar ? 'الصلاحية الجديدة: User' : 'New role: User'
    }
    if (row.action === 'updated' && Array.isArray(row.details?.changed_fields)) {
      const count = row.details.changed_fields.length
      if (count > 0) return ar ? `تم تعديل ${count} ${count === 1 ? 'حقل' : 'حقول'}` : `${count} field${count === 1 ? '' : 's'} changed`
    }
    return ''
  }

  return <section className="panel admin-activity-panel">
    <div className="admin-v3-section-head">
      <div>
        <div className="eyebrow">Super Admin · Activity</div>
        <h2>{ar ? 'سجل الإدارة' : 'Admin activity log'}</h2>
        <p>{ar ? 'كل عمليات الإضافة والتعديل والحذف وإدارة المستخدمين والإشعارات، مع الأدمن الذي نفّذ الإجراء ووقته.' : 'All content changes, user management actions, and notifications with the admin who performed them and the time.'}</p>
      </div>
      <Icon name="layers" />
    </div>

    {error && <p className="notice error" role="alert">{error}</p>}
    {loading ? <div className="page-state">{ar ? 'جاري تحميل السجل…' : 'Loading activity…'}</div> : <div className="admin-activity-timeline">
      {rows.map((row) => {
        const actor = row.actor_user_id ? actors.get(row.actor_user_id) : null
        const detail = detailText(row)
        return <article className={`admin-activity-entry activity-${row.action}`} key={row.id}>
          <span className="admin-activity-marker"><Icon name={actionIcon(row.action)} width={17} height={17} /></span>
          <div className="admin-activity-copy">
            <div className="admin-activity-heading">
              <strong>{actionLabel(row)}</strong>
              <span className="admin-activity-entity">{entityLabel(row.entity_type)}</span>
            </div>
            <p>{row.entity_label}</p>
            <div className="admin-activity-meta">
              <span>{actor?.name || (ar ? 'النظام' : 'System')}</span>
              {actor?.email && actor.email !== actor.name && <span>{actor.email}</span>}
              {detail && <span>{detail}</span>}
            </div>
          </div>
          <time dateTime={row.created_at}>{new Intl.DateTimeFormat(locale, { dateStyle: 'medium', timeStyle: 'short' }).format(new Date(row.created_at))}</time>
        </article>
      })}
      {!rows.length && !error && <div className="empty-state">{ar ? 'لا توجد عمليات مسجلة بعد. أي إجراء إداري جديد سيظهر هنا تلقائيًا.' : 'No activity has been recorded yet. New admin actions will appear here automatically.'}</div>}
    </div>}
  </section>
}
