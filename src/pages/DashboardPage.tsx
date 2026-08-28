import { useEffect, useState } from 'react'
import { Link } from 'react-router-dom'
import { useAuth } from '../hooks/useAuth'
import { useUi } from '../hooks/useUi'
import { supabase } from '../lib/supabase'
import { StatCard } from '../components/StatCard'
import { SessionCalendar } from '../components/SessionCalendar'
import { errorMessage } from '../lib/errors'

type ViewedRow = { id: string; session_id: string; viewed_at: string; session: { id: string; title: string; starts_at: string } | null }
type ProgressRow = { id: string; video_id: string; seconds: number; percent: number; updated_at: string; video: { id: string; title: string; session_id: string; session: { id: string; title: string } | null } | null }

export function DashboardPage() {
  const { user } = useAuth()
  const { locale, t, language } = useUi()
  const [views, setViews] = useState<ViewedRow[]>([])
  const [bookmarks, setBookmarks] = useState(0)
  const [feedback, setFeedback] = useState(0)
  const [progress, setProgress] = useState<ProgressRow[]>([])
  const [loadError, setLoadError] = useState('')

  useEffect(() => {
    if (!user) return
    setLoadError('')
    void Promise.all([
      supabase.from('session_views').select('id,session_id,viewed_at,session:sessions(id,title,starts_at)').eq('user_id', user.id).order('viewed_at', { ascending: false }).limit(12),
      supabase.from('bookmarks').select('*', { count: 'exact', head: true }).eq('user_id', user.id),
      supabase.from('feedback').select('*', { count: 'exact', head: true }).eq('user_id', user.id),
      supabase.from('video_progress').select('id,video_id,seconds,percent,updated_at,video:session_videos(id,title,session_id,session:sessions(id,title))').eq('user_id', user.id).lt('percent', 95).order('updated_at', { ascending: false }).limit(6),
    ]).then(([viewResult, bookmarkResult, feedbackResult, progressResult]) => {
      const firstError = viewResult.error || bookmarkResult.error || feedbackResult.error || progressResult.error
      if (firstError) { setLoadError(errorMessage(firstError)); return }
      setViews((viewResult.data ?? []) as unknown as ViewedRow[])
      setBookmarks(bookmarkResult.count ?? 0)
      setFeedback(feedbackResult.count ?? 0)
      setProgress((progressResult.data ?? []) as unknown as ProgressRow[])
    })
  }, [user?.id])

  const calendarSessions = views.flatMap((row) => row.session ? [row.session] : [])
  const ar = language === 'ar'

  return <section>
    <div className="section-heading"><div><div className="eyebrow">{t('dashboard.eyebrow')}</div><h1>{t('dashboard.title')}</h1></div><Link className="button button-secondary" to="/saved">{ar ? 'عرض المحفوظات' : 'View saved'}</Link></div>
    {loadError && <p className="notice error" role="alert">{loadError}</p>}
    <div className="stats-grid stats-grid-v2">
      <StatCard label={ar ? 'السيشنات التي شاهدتها' : 'Sessions viewed'} value={views.length} />
      <StatCard label={t('dashboard.bookmarks')} value={bookmarks} />
      <StatCard label={t('dashboard.feedback')} value={feedback} />
      <StatCard label={t('dashboard.progress')} value={progress.length} />
    </div>

    <SessionCalendar sessions={calendarSessions} />

    <div className="dashboard-columns">
      <section className="panel"><div className="panel-heading"><h2>{ar ? 'آخر السيشنات التي فتحتها' : 'Recently viewed sessions'}</h2></div><div className="list">
        {views.map((row) => row.session && <Link key={row.id} className="list-row" to={`/sessions/${row.session.id}`}><strong>{row.session.title}</strong><span>{new Intl.DateTimeFormat(locale, { dateStyle: 'medium', timeStyle: 'short' }).format(new Date(row.session.starts_at))}</span></Link>)}
        {!views.length && <div className="empty-state">{ar ? 'لم تفتحي أي سيشن بعد. اختاري سيشن من صفحة الاستكشاف وسيظهر هنا.' : 'You have not opened any sessions yet. Explore a session and it will appear here.'}</div>}
      </div></section>

      <section className="panel"><div className="panel-heading"><h2>{t('dashboard.continueWatching')}</h2></div><div className="continue-list">
        {progress.map((row) => row.video?.session && <Link className="continue-card" key={row.id} to={`/sessions/${row.video.session.id}`}><div><small>{row.video.session.title}</small><strong>{row.video.title}</strong></div><div className="continue-progress"><span><i style={{ width: `${Math.min(100, row.percent)}%` }} /></span><b>{Math.round(row.percent)}%</b></div></Link>)}
        {!progress.length && <div className="empty-state">{t('dashboard.noProgress')}</div>}
      </div></section>
    </div>
  </section>
}
