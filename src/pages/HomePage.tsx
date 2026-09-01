import { useEffect, useMemo, useState, type FormEvent } from 'react'
import { Link, useNavigate } from 'react-router-dom'
import { SessionCard } from '../components/SessionCard'
import { Icon } from '../components/Icon'
import { useUi } from '../hooks/useUi'
import { publicSupabase } from '../lib/supabase'
import type { Category, RecordingProvider, SearchSession } from '../types/domain'

function isRecordingProvider(value: string): value is RecordingProvider {
  return ['youtube', 'google_drive', 'whatsapp', 'telegram'].includes(value)
}

type SessionMetaRow = {
  id: string
  is_pinned: boolean | null
  cover_focus_x: number | null
  cover_focus_y: number | null
}

export function HomePage() {
  const { language, t } = useUi()
  const navigate = useNavigate()
  const ar = language === 'ar'
  const [sessions, setSessions] = useState<SearchSession[]>([])
  const [categories, setCategories] = useState<Category[]>([])
  const [query, setQuery] = useState('')
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')

  useEffect(() => {
    let active = true

    async function loadHome() {
      setLoading(true)
      setError('')
      try {
        const [sessionsResult, categoriesResult] = await Promise.all([
          publicSupabase.rpc('search_sessions', { search_text: undefined, category_filter: undefined }),
          publicSupabase.from('categories').select('*').order('name'),
        ])
        if (sessionsResult.error) throw sessionsResult.error
        if (categoriesResult.error) throw categoriesResult.error

        const baseSessions = (sessionsResult.data ?? []) as SearchSession[]
        const nextCategories = (categoriesResult.data ?? []) as Category[]

        if (!baseSessions.length) {
          if (active) {
            setSessions([])
            setCategories(nextCategories)
          }
          return
        }

        const ids = baseSessions.map((session) => session.id)
        const [sessionMetaResult, videoResult] = await Promise.all([
          (publicSupabase.from('sessions') as any).select('id,is_pinned,cover_focus_x,cover_focus_y').in('id', ids),
          publicSupabase.from('session_videos').select('session_id,video_provider').in('session_id', ids),
        ])
        if (sessionMetaResult.error) throw sessionMetaResult.error
        if (videoResult.error) throw videoResult.error

        const metaBySession = new Map<string, SessionMetaRow>(
          ((sessionMetaResult.data ?? []) as SessionMetaRow[]).map((row) => [row.id, row]),
        )
        const providersBySession = new Map<string, Set<RecordingProvider>>()
        for (const row of videoResult.data ?? []) {
          const provider = String(row.video_provider)
          if (!isRecordingProvider(provider)) continue
          const current = providersBySession.get(row.session_id) ?? new Set<RecordingProvider>()
          current.add(provider)
          providersBySession.set(row.session_id, current)
        }

        const enriched = baseSessions.map((session) => {
          const meta = metaBySession.get(session.id)
          return {
            ...session,
            is_pinned: Boolean(meta?.is_pinned),
            cover_focus_x: meta?.cover_focus_x ?? session.cover_focus_x,
            cover_focus_y: meta?.cover_focus_y ?? session.cover_focus_y,
            recording_providers: [...(providersBySession.get(session.id) ?? new Set<RecordingProvider>())],
          }
        })

        if (active) {
          setSessions(enriched)
          setCategories(nextCategories)
        }
      } catch (loadError) {
        console.error('Could not load home page', loadError)
        if (active) setError(ar ? 'تعذر تحميل الصفحة الرئيسية الآن. حاولي التحديث مرة أخرى.' : 'Could not load the home page right now. Please refresh and try again.')
      } finally {
        if (active) setLoading(false)
      }
    }

    void loadHome()
    return () => { active = false }
  }, [ar])

  const now = Date.now()
  const pinnedSession = useMemo(() => sessions.find((session) => Boolean(session.is_pinned)) ?? null, [sessions])
  const upcomingSessions = useMemo(() => [...sessions]
    .filter((session) => new Date(session.starts_at).getTime() >= now)
    .sort((a, b) => new Date(a.starts_at).getTime() - new Date(b.starts_at).getTime())
    .slice(0, 3), [sessions, now])
  const recentSessions = useMemo(() => [...sessions]
    .sort((a, b) => new Date(b.created_at).getTime() - new Date(a.created_at).getTime())
    .slice(0, 4), [sessions])
  const topRatedSessions = useMemo(() => [...sessions]
    .filter((session) => Number(session.rating_count || 0) > 0)
    .sort((a, b) => Number(b.average_rating || 0) - Number(a.average_rating || 0) || Number(b.rating_count || 0) - Number(a.rating_count || 0))
    .slice(0, 4), [sessions])
  const sessionsWithRecording = useMemo(() => sessions.filter((session) => (session.recording_providers?.length ?? 0) > 0).length, [sessions])

  function submitSearch(event: FormEvent) {
    event.preventDefault()
    const value = query.trim()
    navigate(value ? `/sessions?search=${encodeURIComponent(value)}` : '/sessions')
  }

  if (loading) return <div className="page-state">{t('sessions.loading')}</div>

  return <div className="home-page">
    <section className="home-hero">
      <div className="home-hero-copy">
        <div className="home-hero-eyebrow">{ar ? 'كل السيشنات في مكان واحد' : 'Your sessions, in one place'}</div>
        <h1>{ar ? 'ابدئي من هنا، ووصلي للمهم بسرعة.' : 'Start here and get to what matters fast.'}</h1>
        <p>{ar ? 'السيشنات المثبتة، الأقرب، أحدث ما دخل الأرشيف، والأعلى تقييمًا — كلها قدامك من أول شاشة.' : 'Pinned sessions, what is coming next, the latest archive additions, and top-rated sessions — all from the first screen.'}</p>
        <form className="home-search" onSubmit={submitSearch}>
          <input aria-label={ar ? 'ابحثي في السيشنات' : 'Search sessions'} placeholder={ar ? 'ابحثي بعنوان السيشن، المتحدث أو التصنيف...' : 'Search by title, speaker, or category...'} value={query} onChange={(event) => setQuery(event.target.value)} />
          <button className="button button-primary" type="submit">{t('common.search')}</button>
        </form>
        <div className="home-hero-actions">
          <Link className="button home-secondary-button" to="/sessions">{ar ? 'استعراض كل السيشنات' : 'Browse all sessions'}</Link>
        </div>
      </div>
      <div className="home-hero-stats" aria-label={ar ? 'ملخص الأرشيف' : 'Archive summary'}>
        <div className="home-stat"><strong>{sessions.length}</strong><span>{ar ? 'Session في الأرشيف' : 'Archived sessions'}</span></div>
        <div className="home-stat"><strong>{categories.length}</strong><span>{ar ? 'تصنيفات' : 'Categories'}</span></div>
        <div className="home-stat"><strong>{sessionsWithRecording}</strong><span>{ar ? 'تسجيلات متاحة' : 'Recordings available'}</span></div>
      </div>
    </section>

    {error && <p className="notice error">{error}</p>}

    <section className="home-section">
      <div className="home-section-head">
        <div><span className="home-section-kicker"><Icon name="bookmark" />{ar ? 'مهم الآن' : 'Featured'}</span><h2>{ar ? 'Session مثبتة' : 'Pinned session'}</h2></div>
        <Link to="/sessions" className="home-section-link">{ar ? 'كل السيشنات' : 'All sessions'} <span aria-hidden="true">←</span></Link>
      </div>
      {pinnedSession ? <div className="home-featured"><SessionCard session={pinnedSession} /></div> : <div className="home-empty home-empty-featured"><Icon name="bookmark" /><div><strong>{ar ? 'ما في Session مثبتة حاليًا' : 'No pinned session right now'}</strong><span>{ar ? 'أول ما يتم تثبيت Session من الإدارة حتظهر هنا تلقائيًا.' : 'As soon as a session is pinned by an admin, it will appear here automatically.'}</span></div></div>}
    </section>

    <section className="home-section">
      <div className="home-section-head"><div><span className="home-section-kicker"><Icon name="calendar" />{ar ? 'على الطريق' : 'Coming up'}</span><h2>{ar ? 'Sessions قريبة' : 'Upcoming sessions'}</h2></div></div>
      {upcomingSessions.length ? <div className="home-card-grid home-card-grid-three">{upcomingSessions.map((session) => <SessionCard key={session.id} session={session} />)}</div> : <div className="home-empty"><Icon name="calendar" /><div><strong>{ar ? 'ما في Sessions قادمة مضافة الآن' : 'No upcoming sessions yet'}</strong><span>{ar ? 'لما تتم إضافة موعد جديد حيظهر هنا مباشرة.' : 'New scheduled sessions will show up here automatically.'}</span></div></div>}
    </section>

    <section className="home-section">
      <div className="home-section-head"><div><span className="home-section-kicker"><Icon name="layers" />{ar ? 'وصلت للأرشيف' : 'Fresh in the archive'}</span><h2>{ar ? 'أضيف حديثًا للأرشيف' : 'Recently added'}</h2></div><Link to="/sessions" className="home-section-link">{ar ? 'عرض الكل' : 'View all'} <span aria-hidden="true">←</span></Link></div>
      {recentSessions.length ? <div className="home-card-grid">{recentSessions.map((session) => <SessionCard key={session.id} session={session} />)}</div> : <div className="home-empty"><Icon name="layers" /><div><strong>{ar ? 'الأرشيف فاضي حاليًا' : 'The archive is empty'}</strong><span>{ar ? 'أول Session منشورة حتظهر هنا.' : 'The first published session will appear here.'}</span></div></div>}
    </section>

    <section className="home-section">
      <div className="home-section-head"><div><span className="home-section-kicker"><Icon name="chart" />{ar ? 'اختيارات الجمهور' : 'Community favorites'}</span><h2>{ar ? 'أعلى Sessions تقييمًا' : 'Top-rated sessions'}</h2></div></div>
      {topRatedSessions.length ? <div className="home-card-grid">{topRatedSessions.map((session) => <SessionCard key={session.id} session={session} />)}</div> : <div className="home-empty"><Icon name="chart" /><div><strong>{ar ? 'لسه ما في تقييمات كفاية' : 'No ratings yet'}</strong><span>{ar ? 'بعد أول تقييم، أعلى السيشنات حتظهر هنا.' : 'Once ratings arrive, the highest-rated sessions will appear here.'}</span></div></div>}
    </section>

    <section className="home-section home-categories-section">
      <div className="home-section-head"><div><span className="home-section-kicker"><Icon name="layers" />{ar ? 'وصول أسرع' : 'Quick access'}</span><h2>{ar ? 'تصنيفات سريعة' : 'Quick categories'}</h2></div></div>
      <div className="home-category-grid">
        {categories.map((category) => {
          const count = sessions.filter((session) => session.category_id === category.id).length
          return <Link className="home-category-card" key={category.id} to={`/sessions?category=${encodeURIComponent(category.id)}`}>
            <span className="home-category-icon">{category.name.trim().slice(0, 1).toUpperCase()}</span>
            <span className="home-category-copy"><strong dir="auto">{category.name}</strong><small>{ar ? `${count} Session` : `${count} session${count === 1 ? '' : 's'}`}</small></span>
            <span className="home-category-arrow" aria-hidden="true">←</span>
          </Link>
        })}
      </div>
    </section>
  </div>
}
