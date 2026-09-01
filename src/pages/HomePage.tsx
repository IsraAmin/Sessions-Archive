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

type HomeSectionProps = {
  icon: 'bookmark' | 'calendar' | 'layers' | 'chart'
  kicker: string
  title: string
  view: 'pinned' | 'upcoming' | 'recent' | 'top-rated'
  sessions: SearchSession[]
  emptyTitle: string
  emptyText: string
  ar: boolean
}

function HomeSessionSection({ icon, kicker, title, view, sessions, emptyTitle, emptyText, ar }: HomeSectionProps) {
  return <section className="home-section">
    <div className="home-section-head">
      <div><span className="home-section-kicker"><Icon name={icon} />{kicker}</span><h2>{title}</h2></div>
      <Link to={`/sessions?view=${view}`} className="home-section-link">{ar ? 'عرض الكل' : 'View all'} <span aria-hidden="true">←</span></Link>
    </div>
    {sessions.length ? <div className="home-session-rail">{sessions.map((session) => <div className="home-session-rail-item" key={session.id}><SessionCard session={session} /></div>)}</div> : <div className="home-empty"><Icon name={icon} /><div><strong>{emptyTitle}</strong><span>{emptyText}</span></div></div>}
  </section>
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
        if (active) setError(ar ? 'تعذر تحميل الصفحة الرئيسية الآن. حاول التحديث مرة أخرى.' : 'Could not load the home page right now. Please refresh and try again.')
      } finally {
        if (active) setLoading(false)
      }
    }

    void loadHome()
    return () => { active = false }
  }, [ar])

  const now = Date.now()
  const pinnedSessions = useMemo(() => sessions.filter((session) => Boolean(session.is_pinned)).slice(0, 6), [sessions])
  const upcomingSessions = useMemo(() => [...sessions]
    .filter((session) => new Date(session.starts_at).getTime() >= now)
    .sort((a, b) => new Date(a.starts_at).getTime() - new Date(b.starts_at).getTime())
    .slice(0, 6), [sessions, now])
  const recentSessions = useMemo(() => [...sessions]
    .sort((a, b) => new Date(b.created_at).getTime() - new Date(a.created_at).getTime())
    .slice(0, 6), [sessions])
  const topRatedSessions = useMemo(() => [...sessions]
    .filter((session) => Number(session.rating_count || 0) > 0)
    .sort((a, b) => Number(b.average_rating || 0) - Number(a.average_rating || 0) || Number(b.rating_count || 0) - Number(a.rating_count || 0))
    .slice(0, 6), [sessions])

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
        <h1>{ar ? 'مرحبًا بك' : 'Welcome'}</h1>
        <p>{ar ? 'ابحث عن السيشن التي تحتاجها، واستكشف الأرشيف بسهولة من مكان واحد.' : 'Search for the session you need and explore the archive easily from one place.'}</p>
        <form className="home-search" onSubmit={submitSearch}>
          <input aria-label={ar ? 'ابحث في السيشنات' : 'Search sessions'} placeholder={ar ? 'ابحث بعنوان السيشن، المتحدث أو التصنيف...' : 'Search by title, speaker, or category...'} value={query} onChange={(event) => setQuery(event.target.value)} />
          <button className="button button-primary" type="submit">{t('common.search')}</button>
        </form>
        <div className="home-hero-actions">
          <Link className="button home-secondary-button" to="/sessions">{ar ? 'استعراض كل السيشنات' : 'Browse all sessions'}</Link>
        </div>
      </div>
    </section>

    {error && <p className="notice error">{error}</p>}

    <HomeSessionSection
      icon="bookmark"
      kicker={ar ? 'مهم الآن' : 'Featured'}
      title={ar ? 'السيشن المثبتة' : 'Pinned session'}
      view="pinned"
      sessions={pinnedSessions}
      emptyTitle={ar ? 'ما في Session مثبتة حاليًا' : 'No pinned session right now'}
      emptyText={ar ? 'أول ما يتم تثبيت Session من الإدارة ستظهر هنا تلقائيًا.' : 'As soon as a session is pinned by an admin, it will appear here automatically.'}
      ar={ar}
    />

    <HomeSessionSection
      icon="calendar"
      kicker={ar ? 'على الطريق' : 'Coming up'}
      title={ar ? 'Sessions قريبة' : 'Upcoming sessions'}
      view="upcoming"
      sessions={upcomingSessions}
      emptyTitle={ar ? 'ما في Sessions قادمة مضافة الآن' : 'No upcoming sessions yet'}
      emptyText={ar ? 'لما تتم إضافة موعد جديد سيظهر هنا مباشرة.' : 'New scheduled sessions will show up here automatically.'}
      ar={ar}
    />

    <HomeSessionSection
      icon="layers"
      kicker={ar ? 'وصلت للأرشيف' : 'Fresh in the archive'}
      title={ar ? 'أضيف حديثًا للأرشيف' : 'Recently added'}
      view="recent"
      sessions={recentSessions}
      emptyTitle={ar ? 'الأرشيف فاضي حاليًا' : 'The archive is empty'}
      emptyText={ar ? 'أول Session منشورة ستظهر هنا.' : 'The first published session will appear here.'}
      ar={ar}
    />

    <HomeSessionSection
      icon="chart"
      kicker={ar ? 'اختيارات الجمهور' : 'Community favorites'}
      title={ar ? 'أعلى Sessions تقييمًا' : 'Top-rated sessions'}
      view="top-rated"
      sessions={topRatedSessions}
      emptyTitle={ar ? 'لسه ما في تقييمات كفاية' : 'No ratings yet'}
      emptyText={ar ? 'بعد أول تقييم، أعلى السيشنات ستظهر هنا.' : 'Once ratings arrive, the highest-rated sessions will appear here.'}
      ar={ar}
    />

    <section className="home-section home-categories-section">
      <div className="home-section-head"><div><span className="home-section-kicker"><Icon name="layers" />{ar ? 'وصول أسرع' : 'Quick access'}</span><h2>{ar ? 'تصنيفات سريعة' : 'Quick categories'}</h2></div><Link to="/sessions" className="home-section-link">{ar ? 'عرض الكل' : 'View all'} <span aria-hidden="true">←</span></Link></div>
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
