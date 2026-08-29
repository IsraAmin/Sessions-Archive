import { useCallback, useEffect, useState } from 'react'
import { Navigate, useNavigate } from 'react-router-dom'
import { Icon } from '../components/Icon'
import { useAuth } from '../hooks/useAuth'
import { useUi } from '../hooks/useUi'
import { errorMessage } from '../lib/errors'
import { supabase } from '../lib/supabase'

const PHONE_QUERY = '(max-width: 680px)'
const PAGE_SIZE = 10

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

function phoneViewport() {
  return window.matchMedia(PHONE_QUERY).matches
}

export function NotificationsPage() {
  const { user } = useAuth()
  const { language, locale } = useUi()
  const navigate = useNavigate()
  const [isPhone, setIsPhone] = useState(phoneViewport)
  const [items, setItems] = useState<NotificationRow[]>([])
  const [loading, setLoading] = useState(true)
  const [loadingMore, setLoadingMore] = useState(false)
  const [hasMore, setHasMore] = useState(false)
  const [loadError, setLoadError] = useState('')
  const ar = language === 'ar'

  useEffect(() => {
    const media = window.matchMedia(PHONE_QUERY)
    const syncViewport = () => setIsPhone(media.matches)
    syncViewport()
    media.addEventListener('change', syncViewport)
    return () => media.removeEventListener('change', syncViewport)
  }, [])

  const loadChunk = useCallback(async (offset: number, replace: boolean) => {
    if (!user) return
    if (replace) setLoading(true)
    else setLoadingMore(true)
    setLoadError('')

    try {
      const { data, error } = await supabase
        .from('notifications')
        .select('*')
        .eq('user_id', user.id)
        .order('created_at', { ascending: false })
        .range(offset, offset + PAGE_SIZE)

      if (error) throw error
      const rows = (data ?? []) as NotificationRow[]
      const page = rows.slice(0, PAGE_SIZE)
      setHasMore(rows.length > PAGE_SIZE)
      setItems((current) => {
        if (replace) return page
        const existing = new Set(current.map((item) => item.id))
        return [...current, ...page.filter((item) => !existing.has(item.id))]
      })
    } catch (error) {
      setLoadError(errorMessage(error))
    } finally {
      setLoading(false)
      setLoadingMore(false)
    }
  }, [user?.id])

  useEffect(() => {
    if (user) void loadChunk(0, true)
  }, [loadChunk, user?.id])

  async function openItem(item: NotificationRow) {
    if (!user) return
    if (!item.read_at) {
      const now = new Date().toISOString()
      const { error } = await supabase
        .from('notifications')
        .update({ read_at: now })
        .eq('id', item.id)
        .eq('user_id', user.id)
      if (!error) setItems((current) => current.map((entry) => entry.id === item.id ? { ...entry, read_at: now } : entry))
    }
    if (item.href) navigate(item.href)
  }

  if (!isPhone) return <Navigate to="/" replace />

  return <section className="mobile-notifications-page" aria-labelledby="mobile-notifications-title">
    <header className="mobile-notifications-head">
      <span className="mobile-notifications-icon"><Icon name="bell" /></span>
      <div>
        <div className="eyebrow">{ar ? 'التحديثات' : 'Updates'}</div>
        <h1 id="mobile-notifications-title">{ar ? 'الإشعارات' : 'Notifications'}</h1>
        <p>{ar ? 'آخر الإشعارات التي وصلتك، مرتبة من الأحدث.' : 'Your latest notifications, newest first.'}</p>
      </div>
    </header>

    {loadError && <p className="notice error" role="alert">{loadError}</p>}

    <div className="mobile-notifications-list">
      {loading && !items.length && <div className="mobile-notifications-state">{ar ? 'جاري تحميل الإشعارات…' : 'Loading notifications…'}</div>}
      {!loading && !items.length && !loadError && <div className="mobile-notifications-state mobile-notifications-empty"><Icon name="bell" /><strong>{ar ? 'لا توجد إشعارات بعد' : 'No notifications yet'}</strong><span>{ar ? 'أي تحديث يصلك سيظهر هنا.' : 'New updates will appear here.'}</span></div>}

      {items.map((item) => <button
        type="button"
        key={item.id}
        className={`mobile-notification-row ${item.read_at ? '' : 'is-unread'}`}
        onClick={() => void openItem(item)}
      >
        <span className="mobile-notification-row-copy">
          <strong>{ar ? item.title_ar : item.title_en}</strong>
          <span>{ar ? item.body_ar : item.body_en}</span>
          <time dateTime={item.created_at}>{new Intl.DateTimeFormat(locale, { dateStyle: 'medium', timeStyle: 'short' }).format(new Date(item.created_at))}</time>
        </span>
      </button>)}
    </div>

    {hasMore && <button
      type="button"
      className="button button-secondary mobile-notifications-more"
      disabled={loadingMore}
      onClick={() => void loadChunk(items.length, false)}
    >{loadingMore ? (ar ? 'جاري التحميل…' : 'Loading…') : (ar ? 'عرض المزيد' : 'See More')}</button>}
  </section>
}
