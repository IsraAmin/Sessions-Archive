import { useEffect, useMemo, useState } from 'react'
import { Link } from 'react-router-dom'
import { useUi } from '../hooks/useUi'
import { supabase } from '../lib/supabase'
import { Icon } from '../components/Icon'

type SessionRow = { id: string; title: string; category_id: string | null; speaker_id: string | null }
type CategoryRow = { id: string; name: string }
type SpeakerRow = { id: string; name: string }
type ProfileRow = { id: string; full_name: string }
type RegistrationRow = { user_id: string; session_id: string; attendance_status: string }
type FeedbackRow = { user_id: string; session_id: string; rating: number }
type ViewRow = { user_id: string; session_id: string }
type ProgressRow = { user_id: string; video_id: string; video: { session_id: string } | null }
type VisitStats = { unique_visitors: number; total_visits: number; today_visitors: number; today_visits: number }

type Ranked = { id: string; label: string; value: number }
function rank(counts: Map<string, number>, labels: Map<string, string>, limit = 7): Ranked[] {
  return [...counts.entries()].map(([id, value]) => ({ id, label: labels.get(id) ?? id, value })).sort((a, b) => b.value - a.value).slice(0, limit)
}

const EMPTY_VISIT_STATS: VisitStats = { unique_visitors: 0, total_visits: 0, today_visitors: 0, today_visits: 0 }

export function AnalyticsPage() {
  const { language, t } = useUi()
  const [sessions, setSessions] = useState<SessionRow[]>([])
  const [categories, setCategories] = useState<CategoryRow[]>([])
  const [speakers, setSpeakers] = useState<SpeakerRow[]>([])
  const [profiles, setProfiles] = useState<ProfileRow[]>([])
  const [registrations, setRegistrations] = useState<RegistrationRow[]>([])
  const [feedback, setFeedback] = useState<FeedbackRow[]>([])
  const [views, setViews] = useState<ViewRow[]>([])
  const [progress, setProgress] = useState<ProgressRow[]>([])
  const [visitStats, setVisitStats] = useState<VisitStats>(EMPTY_VISIT_STATS)
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    const visitStatsQuery = (supabase as any).rpc('admin_platform_visit_stats')
    void Promise.all([
      supabase.from('sessions').select('id,title,category_id,speaker_id'),
      supabase.from('categories').select('id,name'),
      supabase.from('speakers').select('id,name'),
      supabase.from('profiles').select('id,full_name'),
      supabase.from('registrations').select('user_id,session_id,attendance_status'),
      supabase.from('feedback').select('user_id,session_id,rating'),
      supabase.from('session_views').select('user_id,session_id'),
      supabase.from('video_progress').select('user_id,video_id,video:session_videos(session_id)'),
      visitStatsQuery,
    ]).then(([sessionResult, categoryResult, speakerResult, profileResult, registrationResult, feedbackResult, viewResult, progressResult, visitStatsResult]) => {
      setSessions((sessionResult.data ?? []) as SessionRow[])
      setCategories((categoryResult.data ?? []) as CategoryRow[])
      setSpeakers((speakerResult.data ?? []) as SpeakerRow[])
      setProfiles((profileResult.data ?? []) as ProfileRow[])
      setRegistrations((registrationResult.data ?? []) as RegistrationRow[])
      setFeedback((feedbackResult.data ?? []) as FeedbackRow[])
      setViews((viewResult.data ?? []) as ViewRow[])
      setProgress((progressResult.data ?? []) as unknown as ProgressRow[])

      const stats = Array.isArray(visitStatsResult.data) ? visitStatsResult.data[0] : visitStatsResult.data
      if (stats) {
        setVisitStats({
          unique_visitors: Number(stats.unique_visitors ?? 0),
          total_visits: Number(stats.total_visits ?? 0),
          today_visitors: Number(stats.today_visitors ?? 0),
          today_visits: Number(stats.today_visits ?? 0),
        })
      }
      setLoading(false)
    })
  }, [])

  const report = useMemo(() => {
    const sessionLabels = new Map(sessions.map((session) => [session.id, session.title]))
    const categoryLabels = new Map(categories.map((category) => [category.id, category.name]))
    const speakerLabels = new Map(speakers.map((speaker) => [speaker.id, speaker.name]))
    const profileLabels = new Map(profiles.map((profile) => [profile.id, profile.full_name]))
    const sessionById = new Map(sessions.map((session) => [session.id, session]))

    const registrationsBySession = new Map<string, number>()
    const viewsBySession = new Map<string, number>()
    const categoryInterest = new Map<string, number>()
    const speakerInterest = new Map<string, number>()
    const activity = new Map<string, number>()

    for (const row of views) {
      viewsBySession.set(row.session_id, (viewsBySession.get(row.session_id) ?? 0) + 1)
      activity.set(row.user_id, (activity.get(row.user_id) ?? 0) + 1)
    }
    for (const row of registrations) {
      registrationsBySession.set(row.session_id, (registrationsBySession.get(row.session_id) ?? 0) + 1)
      const session = sessionById.get(row.session_id)
      if (session?.category_id) categoryInterest.set(session.category_id, (categoryInterest.get(session.category_id) ?? 0) + 1)
      if (session?.speaker_id) speakerInterest.set(session.speaker_id, (speakerInterest.get(session.speaker_id) ?? 0) + 1)
      activity.set(row.user_id, (activity.get(row.user_id) ?? 0) + 3)
    }
    for (const row of feedback) activity.set(row.user_id, (activity.get(row.user_id) ?? 0) + 2)
    for (const row of progress) activity.set(row.user_id, (activity.get(row.user_id) ?? 0) + 2)

    const uniqueViews = views.length
    const totalRegistrations = registrations.length
    const attended = registrations.filter((row) => row.attendance_status === 'attended').length
    const averageRating = feedback.length ? feedback.reduce((sum, row) => sum + row.rating, 0) / feedback.length : 0

    return {
      uniqueViews,
      totalRegistrations,
      attended,
      averageRating,
      viewToRegistration: uniqueViews ? Math.min(100, totalRegistrations / uniqueViews * 100) : 0,
      registrationToAttendance: totalRegistrations ? attended / totalRegistrations * 100 : 0,
      sessionRanking: rank(registrationsBySession, sessionLabels, 12),
      categoryRanking: rank(categoryInterest, categoryLabels),
      speakerRanking: rank(speakerInterest, speakerLabels),
      studentRanking: rank(activity, profileLabels),
      viewsBySession,
    }
  }, [sessions, categories, speakers, profiles, registrations, feedback, views, progress])

  if (loading) return <div className="page-state">{t('common.loading')}</div>
  const maxSessions = Math.max(1, ...report.sessionRanking.map((item) => item.value))
  const maxCategories = Math.max(1, ...report.categoryRanking.map((item) => item.value))
  const maxSpeakers = Math.max(1, ...report.speakerRanking.map((item) => item.value))
  const ar = language === 'ar'

  return <section className="analytics-page">
    <div className="section-heading analytics-title"><div><div className="eyebrow">{t('admin.analytics')}</div><h1>{ar ? 'أداء المنصة' : 'Platform performance'}</h1><p>{ar ? 'الزوار الحقيقيون للمنصة، ثم التفاعل مع السيشنات والتسجيل والحضور.' : 'Actual platform visitors, followed by session engagement, registrations, and attendance.'}</p></div><Icon name="chart" /></div>

    <div className="analytics-summary-grid">
      <div className="panel analytics-summary-card"><span>{ar ? 'إجمالي الزوار' : 'Unique visitors'}</span><strong>{visitStats.unique_visitors}</strong></div>
      <div className="panel analytics-summary-card"><span>{ar ? 'إجمالي الزيارات' : 'Total visits'}</span><strong>{visitStats.total_visits}</strong></div>
      <div className="panel analytics-summary-card"><span>{ar ? 'زوار اليوم' : 'Visitors today'}</span><strong>{visitStats.today_visitors}</strong></div>
      <div className="panel analytics-summary-card"><span>{ar ? 'زيارات اليوم' : 'Visits today'}</span><strong>{visitStats.today_visits}</strong></div>
    </div>

    <div className="funnel-panel panel">
      <div className="funnel-stage"><span>{ar ? 'مشاهدات السيشنات' : 'Session views'}</span><strong>{report.uniqueViews}</strong><small>100%</small></div>
      <div className="funnel-arrow">→</div>
      <div className="funnel-stage primary"><span>{t('admin.registrations')}</span><strong>{report.totalRegistrations}</strong><small>{Math.round(report.viewToRegistration)}%</small></div>
      <div className="funnel-arrow">→</div>
      <div className="funnel-stage success"><span>{ar ? 'الحضور' : 'Attendance'}</span><strong>{report.attended}</strong><small>{Math.round(report.registrationToAttendance)}%</small></div>
    </div>

    <div className="analytics-summary-grid">
      <div className="panel analytics-summary-card"><span>{t('admin.avgRating')}</span><strong>{report.averageRating.toFixed(1)} / 5</strong></div>
      <div className="panel analytics-summary-card"><span>{t('admin.videoStarts')}</span><strong>{progress.length}</strong></div>
      <div className="panel analytics-summary-card"><span>{t('admin.conversion')}</span><strong>{Math.round(report.viewToRegistration)}%</strong></div>
      <div className="panel analytics-summary-card"><span>{t('admin.attendanceRate')}</span><strong>{Math.round(report.registrationToAttendance)}%</strong></div>
    </div>

    <section className="panel analytics-detail-panel">
      <div className="admin-section-heading"><div><span className="eyebrow">{t('admin.sessions')}</span><h2>{ar ? 'التسجيلات لكل سيشن' : 'Registrations by session'}</h2></div></div>
      <div className="session-analytics-table">
        {report.sessionRanking.map((item) => <Link key={item.id} to={`/sessions/${item.id}`} className="session-analytics-row">
          <span className="session-analytics-title">{item.label}</span>
          <span className="session-analytics-bar"><i style={{ width: `${item.value / maxSessions * 100}%` }} /></span>
          <span className="session-analytics-value"><strong>{item.value}</strong><small>{ar ? 'تسجيل' : 'registrations'}</small></span>
          <span className="session-analytics-views"><strong>{report.viewsBySession.get(item.id) ?? 0}</strong><small>{ar ? 'مشاهدة' : 'views'}</small></span>
        </Link>)}
        {!report.sessionRanking.length && <div className="empty-state">{ar ? 'ستظهر المقارنة بعد أول تسجيل في سيشن.' : 'Session comparisons will appear after the first registration.'}</div>}
      </div>
    </section>

    <div className="analytics-three-grid">
      <section className="panel analytics-detail-panel"><h2>{t('admin.topCategories')}</h2>{report.categoryRanking.map((item) => <div className="ranking-row" key={item.id}><span>{item.label}</span><i><b style={{ width: `${item.value / maxCategories * 100}%` }} /></i><strong>{item.value}</strong></div>)}</section>
      <section className="panel analytics-detail-panel"><h2>{t('admin.topSpeakers')}</h2>{report.speakerRanking.map((item) => <div className="ranking-row" key={item.id}><span>{item.label}</span><i><b style={{ width: `${item.value / maxSpeakers * 100}%` }} /></i><strong>{item.value}</strong></div>)}</section>
      <section className="panel analytics-detail-panel"><h2>{t('admin.activeStudents')}</h2>{report.studentRanking.map((item, index) => <div className="student-rank" key={item.id}><em>{index + 1}</em><span>{item.label}</span><strong>{item.value}</strong></div>)}</section>
    </div>
  </section>
}
