import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { useAuth } from '../hooks/useAuth'
import { useUi } from '../hooks/useUi'
import { supabase } from '../lib/supabase'
import { Icon } from './Icon'

const PHONE_QUERY = '(max-width: 680px)'

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

export function NotificationCenter() {
  const { user } = useAuth()
  const { language, locale, t } = useUi()
  const navigate = useNavigate()
  const [open, setOpen] = useState(false)
  const [items, setItems] = useState<NotificationRow[]>([])
  const [loading, setLoading] = useState(false)
  const rootRef = useRef<HTMLDivElement>(null)

  const load = useCallback(async () => {
    if (!user) { setItems([]); return }
    setLoading(true)
    try {
      const { data, error } = await supabase
        .from('notifications')
        .select('*')
        .eq('user_id', user.id)
        .order('created_at', { ascending: false })
        .limit(30)
      if (error) throw error
      setItems((data ?? []) as NotificationRow[])
    } catch (error) {
      console.warn('Notification loading failed', error)
    } finally {
      setLoading(false)
    }
  }, [user?.id])

  useEffect(() => {
    void load()
    if (!user) return
    const timer = window.setInterval(() => void load(), 60_000)
    return () => window.clearInterval(timer)
  }, [load, user?.id])

  useEffect(() => {
    if (!user) return

    const channel = supabase
      .channel(`notifications:${user.id}`)
      .on(
        'postgres_changes',
        {
          event: 'INSERT',
          schema: 'public',
          table: 'notifications',
          filter: `user_id=eq.${user.id}`,
        },
        (payload) => {
          const item = payload.new as NotificationRow
          setItems((current) => [item, ...current.filter((entry) => entry.id !== item.id)].slice(0, 30))
        },
      )
      .subscribe()

    return () => {
      void supabase.removeChannel(channel)
    }
  }, [user?.id])

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
    if (item.read_at || !user) return
    const now = new Date().toISOString()
    const { error } = await supabase
      .from('notifications')
      .update({ read_at: now })
      .eq('id', item.id)
      .eq('user_id', user.id)
    if (!error) setItems((current) => current.map((entry) => entry.id === item.id ? { ...entry, read_at: now } : entry))
  }

  function handleTrigger() {
    const isPhone = window.matchMedia(PHONE_QUERY).matches
    if (isPhone && !loading && unread === 0) {
      setOpen(false)
      navigate('/notifications')
      return
    }
    setOpen((value) => !value)
    if (!open) void load()
  }

  if (!user) return null

  return <div className="notification-center" ref={rootRef}>
    <button className={`top-control notification-trigger ${open ? 'is-active' : ''}`} aria-label={t('notifications.open')} aria-expanded={open} onClick={handleTrigger}>
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
