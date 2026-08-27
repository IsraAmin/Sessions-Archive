import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { useAuth } from '../hooks/useAuth'
import { useUi } from '../hooks/useUi'
import { supabase } from '../lib/supabase'
import { Icon } from './Icon'

type NotificationRow = {
  id: string
  user_id: string
  type: string
  title_ar: string
  title_en: string
  body_ar: string
  body_en: string
  href: string | null
  read_at: string | null
  created_at: string
}

type RegistrationWithSession = {
  session_id: string
  session: { id: string; title: string; starts_at: string } | null
}

export function NotificationCenter() {
  const { user } = useAuth()
  const { language, locale, t } = useUi()
  const navigate = useNavigate()
  const [open, setOpen] = useState(false)
  const [items, setItems] = useState<NotificationRow[]>([])
  const [loading, setLoading] = useState(false)
  const rootRef = useRef<HTMLDivElement>(null)

  const syncReminders = useCallback(async () => {
    if (!user) return
    const { data } = await supabase
      .from('registrations')
      .select('session_id, session:sessions(id,title,starts_at)')
      .eq('user_id', user.id)

    const now = Date.now()
    const oneHour = now + 60 * 60 * 1000
    const reminders = ((data ?? []) as unknown as RegistrationWithSession[])
      .filter((row) => row.session && new Date(row.session.starts_at).getTime() > now && new Date(row.session.starts_at).getTime() <= oneHour)
      .map((row) => ({
        user_id: user.id,
        type: 'session_reminder',
        title_ar: 'السيشن يبدأ قريبًا',
        title_en: 'Session starts soon',
        body_ar: `باقي أقل من ساعة على ${row.session!.title}.`,
        body_en: `${row.session!.title} starts in less than an hour.`,
        href: `/sessions/${row.session!.id}`,
        dedupe_key: `reminder:${row.session!.id}:${row.session!.starts_at}`,
      }))

    if (reminders.length) {
      await supabase.from('notifications').upsert(reminders, { onConflict: 'user_id,dedupe_key', ignoreDuplicates: true })
    }
  }, [user?.id])

  const load = useCallback(async () => {
    if (!user) { setItems([]); return }
    setLoading(true)
    await syncReminders()
    const { data } = await supabase
      .from('notifications')
      .select('*')
      .eq('user_id', user.id)
      .order('created_at', { ascending: false })
      .limit(30)
    setItems((data ?? []) as NotificationRow[])
    setLoading(false)
  }, [user?.id, syncReminders])

  useEffect(() => {
    void load()
    if (!user) return
    const timer = window.setInterval(() => void load(), 60_000)
    return () => window.clearInterval(timer)
  }, [load, user?.id])

  useEffect(() => {
    function closeOutside(event: MouseEvent) {
      if (open && rootRef.current && !rootRef.current.contains(event.target as Node)) setOpen(false)
    }
    document.addEventListener('mousedown', closeOutside)
    return () => document.removeEventListener('mousedown', closeOutside)
  }, [open])

  const unread = useMemo(() => items.filter((item) => !item.read_at).length, [items])

  async function markAllRead() {
    if (!user || !unread) return
    const now = new Date().toISOString()
    const { error } = await supabase.from('notifications').update({ read_at: now }).eq('user_id', user.id).is('read_at', null)
    if (!error) setItems((current) => current.map((item) => ({ ...item, read_at: item.read_at ?? now })))
  }

  async function openItem(item: NotificationRow) {
    if (!item.read_at) {
      const now = new Date().toISOString()
      await supabase.from('notifications').update({ read_at: now }).eq('id', item.id).eq('user_id', user?.id ?? '')
      setItems((current) => current.map((entry) => entry.id === item.id ? { ...entry, read_at: now } : entry))
    }
    setOpen(false)
    if (item.href?.startsWith('/') && !item.href.startsWith('//')) navigate(item.href)
  }

  if (!user) return null

  return <div className="notification-center" ref={rootRef}>
    <button className={`top-control notification-trigger ${open ? 'is-active' : ''}`} aria-label={t('notifications.open')} aria-expanded={open} onClick={() => { setOpen((value) => !value); if (!open) void load() }}>
      <Icon name="bell" />
      {unread > 0 && <span className="notification-badge">{unread > 99 ? '99+' : unread}</span>}
    </button>

    {open && <div className="notification-popover">
      <div className="notification-popover-head">
        <div><strong>{t('notifications.title')}</strong><span>{t('notifications.unread', { n: unread })}</span></div>
        {unread > 0 && <button className="text-action" onClick={() => void markAllRead()}>{t('notifications.markAll')}</button>}
      </div>
      <div className="notification-list">
        {loading && !items.length && <div className="notification-empty">{t('common.loading')}</div>}
        {!loading && !items.length && <div className="notification-empty"><Icon name="bell" /><strong>{t('notifications.empty')}</strong></div>}
        {items.map((item) => <button key={item.id} className={`notification-item ${item.read_at ? '' : 'is-unread'}`} onClick={() => void openItem(item)}>
          <span className="notification-dot" />
          <span className="notification-copy">
            <strong>{language === 'ar' ? item.title_ar : item.title_en}</strong>
            <span>{language === 'ar' ? item.body_ar : item.body_en}</span>
            <time>{new Intl.DateTimeFormat(locale, { dateStyle: 'medium', timeStyle: 'short' }).format(new Date(item.created_at))}</time>
          </span>
        </button>)}
      </div>
    </div>}
  </div>
}
