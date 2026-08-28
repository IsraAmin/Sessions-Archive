import { useEffect, useMemo, useState } from 'react'
import { Icon } from './Icon'
import { useUi } from '../hooks/useUi'
import { errorMessage } from '../lib/errors'
import { supabase } from '../lib/supabase'

type ActivityAction = 'session_created' | 'session_updated' | 'session_deleted' | 'notification_sent'
type ActivityRow = {
  id: string
  actor_user_id: string | null
  action: ActivityAction
  entity_type: 'session' | 'notification'
  entity_id: string | null
  entity_label: string
  created_at: string
}
type ProfileName = { id: string; full_name: string }

export function AdminActivityLog() {
  const { language, locale } = useUi()
  const [rows, setRows] = useState<ActivityRow[]>([])
  const [profiles, setProfiles] = useState<ProfileName[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')
  const ar = language === 'ar'

  useEffect(() => {
    setLoading(true)
    setError('')
    const activityQuery = (supabase as any)
      .from('admin_activity_log')
      .select('id,actor_user_id,action,entity_type,entity_id,entity_label,created_at')
      .order('created_at', { ascending: false })
      .limit(100)

    void Promise.all([
      activityQuery,
      supabase.from('profiles').select('id,full_name'),
    ]).then(([activityResult, profileResult]) => {
      const firstError = activityResult.error || profileResult.error
      if (firstError) {
        setError(errorMessage(firstError))
        return
      }
      setRows((activityResult.data ?? []) as ActivityRow[])
      setProfiles((profileResult.data ?? []) as ProfileName[])
    }).catch((reason) => setError(errorMessage(reason)))
      .finally(() => setLoading(false))
  }, [])

  const actorNames = useMemo(() => {
    const names = new Map<string, string>()
    for (const profile of profiles) if (profile.full_name.trim()) names.set(profile.id, profile.full_name.trim())
    return names
  }, [profiles])

  function actionLabel(action: ActivityAction) {
    const labels: Record<ActivityAction, [string, string]> = {
      session_created: ['أنشأ سيشن', 'Created a session'],
      session_updated: ['عدّل سيشن', 'Updated a session'],
      session_deleted: ['حذف سيشن', 'Deleted a session'],
      notification_sent: ['أرسل إشعارًا', 'Sent a notification'],
    }
    return labels[action][ar ? 0 : 1]
  }

  function actionIcon(action: ActivityAction): 'check' | 'layers' | 'error' | 'bell' {
    if (action === 'session_created') return 'check'
    if (action === 'session_updated') return 'layers'
    if (action === 'session_deleted') return 'error'
    return 'bell'
  }

  return <section className="panel">
    <div className="admin-v3-section-head">
      <div>
        <div className="eyebrow">Activity</div>
        <h2>{ar ? 'سجل الإدارة' : 'Admin activity log'}</h2>
        <p>{ar ? 'آخر عمليات إنشاء وتعديل وحذف السيشنات وإرسال الإشعارات.' : 'Recent session changes and notification sends by admins.'}</p>
      </div>
      <Icon name="layers" />
    </div>

    {error && <p className="notice error" role="alert">{error}</p>}
    {loading ? <div className="page-state">{ar ? 'جاري تحميل السجل…' : 'Loading activity…'}</div> : <div className="admin-v3-list">
      {rows.map((row) => <div className="admin-v3-item" key={row.id}>
        <div className="user-identity">
          <span className="directory-avatar"><Icon name={actionIcon(row.action)} width={18} height={18} /></span>
          <span>
            <strong>{actionLabel(row.action)}</strong>
            <small>{row.entity_label} · {row.actor_user_id ? actorNames.get(row.actor_user_id) || 'Admin' : (ar ? 'النظام' : 'System')}</small>
          </span>
        </div>
        <time className="field-hint" dateTime={row.created_at}>{new Intl.DateTimeFormat(locale, { dateStyle: 'medium', timeStyle: 'short' }).format(new Date(row.created_at))}</time>
      </div>)}
      {!rows.length && !error && <div className="empty-state">{ar ? 'لا توجد عمليات مسجلة بعد. ستظهر هنا تغييرات السيشنات والإشعارات الجديدة.' : 'No activity has been recorded yet. New session changes and notification sends will appear here.'}</div>}
    </div>}
  </section>
}
