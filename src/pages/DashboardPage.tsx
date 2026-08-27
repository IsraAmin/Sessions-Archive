import { useEffect, useState } from 'react'
import { Link } from 'react-router-dom'
import { useAuth } from '../hooks/useAuth'
import { useUi } from '../hooks/useUi'
import { supabase } from '../lib/supabase'
import { StatCard } from '../components/StatCard'
import { SessionCalendar } from '../components/SessionCalendar'

type RegistrationRow = { id: string; session_id: string; session: { id: string; title: string; starts_at: string } | null }
type ProgressRow = { id: string; video_id: string; seconds: number; percent: number; updated_at: string; video: { id: string; title: string; session_id: string; session: { id: string; title: string } | null } | null }

export function DashboardPage() {
  const { user } = useAuth()
  const { locale, t } = useUi()
  const [registrations, setRegistrations] = useState<RegistrationRow[]>([])
  const [bookmarks, setBookmarks] = useState(0)
  const [feedback, setFeedback] = useState(0)
  const [progress, setProgress] = useState<ProgressRow[]>([])

  useEffect(() => {
    if (!user) return
    void Promise.all([
      supabase.from('registrations').select('id, session_id, session:sessions(id,title,starts_at)').eq('user_id', user.id).order('created_at', { ascending: false }),
      supabase.from('bookmarks').select('*', { count: 'exact', head: true }).eq('user_id', user.id),
      supabase.from('feedback').select('*', { count: 'exact', head: true }).eq('user_id', user.id),
      supabase.from('video_progress').select('id,video_id,seconds,percent,updated_at,video:session_videos(id,title,session_id,session:sessions(id,title))').eq('user_id', user.id).lt('percent', 95).order('updated_at', { ascending: false }).limit(6),
    ]).then(([regResult, bookmarkResult, feedbackResult, progressResult]) => {
      setRegistrations((regResult.data ?? []) as unknown as RegistrationRow[])
      setBookmarks(bookmarkResult.count ?? 0)
      setFeedback(feedbackResult.count ?? 0)
      setProgress((progressResult.data ?? []) as unknown as ProgressRow[])
    })
  }, [user?.id])

  const calendarSessions = registrations.flatMap((registration) => registration.session ? [registration.session] : [])

  return <section>
    <div className="section-heading"><div><div className="eyebrow">{t('dashboard.eyebrow')}</div><h1>{t('dashboard.title')}</h1></div></div>
    <div className="stats-grid stats-grid-v2">
      <StatCard label={t('dashboard.registrations')} value={registrations.length} />
      <StatCard label={t('dashboard.bookmarks')} value={bookmarks} />
      <StatCard label={t('dashboard.feedback')} value={feedback} />
      <StatCard label={t('dashboard.progress')} value={progress.length} />
    </div>

    <SessionCalendar sessions={calendarSessions} />

    <div className="dashboard-columns">
      <section className="panel"><div className="panel-heading"><h2>{t('dashboard.registered')}</h2></div><div className="list">
        {registrations.map((registration) => registration.session && <Link key={registration.id} className="list-row" to={`/sessions/${registration.session.id}`}><strong>{registration.session.title}</strong><span>{new Intl.DateTimeFormat(locale, { dateStyle: 'medium', timeStyle: 'short' }).format(new Date(registration.session.starts_at))}</span></Link>)}
        {!registrations.length && <div className="empty-state">{t('dashboard.noRegistered')}</div>}
      </div></section>

      <section className="panel"><div className="panel-heading"><h2>{t('dashboard.continueWatching')}</h2></div><div className="continue-list">
        {progress.map((row) => row.video?.session && <Link className="continue-card" key={row.id} to={`/sessions/${row.video.session.id}`}><div><small>{row.video.session.title}</small><strong>{row.video.title}</strong></div><div className="continue-progress"><span><i style={{ width: `${Math.min(100, row.percent)}%` }} /></span><b>{Math.round(row.percent)}%</b></div></Link>)}
        {!progress.length && <div className="empty-state">{t('dashboard.noProgress')}</div>}
      </div></section>
    </div>
  </section>
}
