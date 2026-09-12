import { useEffect, useMemo, useState, type FormEvent } from 'react'
import { Link } from 'react-router-dom'
import { EventCard } from '../components/EventCard'
import { SessionCard } from '../components/SessionCard'
import { Icon } from '../components/Icon'
import { useUi } from '../hooks/useUi'
import { competitionKindLabel, competitionPublicStatus } from '../lib/competition'
import { publicSupabase } from '../lib/supabase'
import type { Category, CollegeEvent, CollegeEventWithMedia, CompetitionDetails, EventMedia, RecordingProvider, SearchSession } from '../types/domain'

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

function normalizeSearch(value: string) {
  return value
    .toLocaleLowerCase()
    .normalize('NFKD')
    .replace(/[\u064B-\u065F\u0670]/g, '')
    .replace(/ـ/g, '')
    .trim()
}

export function HomePage() {
  const { language, t } = useUi()
  const ar = language === 'ar'
  const [sessions, setSessions] = useState<SearchSession[]>([])
  const [categories, setCategories] = useState<Category[]>([])
  const [events, setEvents] = useState<CollegeEventWithMedia[]>([])
  const [query, setQuery] = useState('')
  const [activeQuery, setActiveQuery] = useState('')
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')

  useEffect(() => {
    let active = true

    async function loadHome() {
      setLoading(true)
      setError('')
      try {
        const [sessionsResult, categoriesResult, eventsResult] = await Promise.all([
          publicSupabase.rpc('search_sessions', { search_text: undefined, category_filter: undefined }),
          publicSupabase.from('categories').select('*').order('name'),
          publicSupabase.from('events').select('*').eq('status', 'published').order('featured', { ascending: false }).order('event_date', { ascending: false }),
        ])
        if (sessionsResult.error) throw sessionsResult.error
        if (categoriesResult.error) throw categoriesResult.error
        if (eventsResult.error) throw eventsResult.error

        const baseSessions = (sessionsResult.data ?? []) as SearchSession[]
        const nextCategories = (categoriesResult.data ?? []) as Category[]
        const baseEvents = (eventsResult.data ?? []) as CollegeEvent[]

        let enrichedSessions = baseSessions
        if (baseSessions.length) {
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

          enrichedSessions = baseSessions.map((session) => {
            const meta = metaBySession.get(session.id)
            return {
              ...session,
              is_pinned: Boolean(meta?.is_pinned),
              cover_focus_x: meta?.cover_focus_x ?? session.cover_focus_x,
              cover_focus_y: meta?.cover_focus_y ?? session.cover_focus_y,
              recording_providers: [...(providersBySession.get(session.id) ?? new Set<RecordingProvider>())],
            }
          })
        }

        let eventMedia: EventMedia[] = []
        let competitionDetails: CompetitionDetails[] = []
        if (baseEvents.length) {
          const ids = baseEvents.map((event) => event.id)
          const [mediaResult, competitionResult] = await Promise.all([
            publicSupabase.from('event_media').select('*').in('event_id', ids).order('position'),
            publicSupabase.from('competition_details').select('*').in('event_id', ids),
          ])
          if (mediaResult.error) throw mediaResult.error
          if (competitionResult.error) throw competitionResult.error
          eventMedia = (mediaResult.data ?? []) as EventMedia[]
          competitionDetails = (competitionResult.data ?? []) as CompetitionDetails[]
        }
        const mediaByEvent = new Map<string, EventMedia[]>()
        for (const item of eventMedia) {
          const current = mediaByEvent.get(item.event_id) ?? []
          current.push(item)
          mediaByEvent.set(item.event_id, current)
        }
        const competitionByEvent = new Map<string, CompetitionDetails>(competitionDetails.map((item) => [item.event_id, item]))
        const enrichedEvents = baseEvents.map((event) => ({ ...event, media: mediaByEvent.get(event.id) ?? [], competition: competitionByEvent.get(event.id) ?? null }))

        if (active) {
          setSessions(enrichedSessions)
          setCategories(nextCategories)
          setEvents(enrichedEvents)
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
  const homeEvents = useMemo(() => [...events]
    .sort((a, b) => Number(b.featured) - Number(a.featured) || new Date(b.event_date).getTime() - new Date(a.event_date).getTime())
    .slice(0, 6), [events])

  const searchNeedle = useMemo(() => normalizeSearch(activeQuery), [activeQuery])
  const searchSessions = useMemo(() => {
    if (!searchNeedle) return []
    return sessions.filter((session) => normalizeSearch([
      session.title,
      session.description,
      session.category_name ?? '',
      session.speaker_name ?? '',
      session.location ?? '',
    ].join(' ')).includes(searchNeedle))
  }, [sessions, searchNeedle])
  const searchEvents = useMemo(() => {
    if (!searchNeedle) return []
    const typeLabels: Record<string, string> = {
      cultural: ar ? 'ثقافية' : 'cultural',
      sports: ar ? 'رياضية' : 'sports',
      initiative: ar ? 'مبادرات إعمار' : 'initiatives renovation',
      social: ar ? 'اجتماعية' : 'social',
      academic: ar ? 'أكاديمية مسابقة هاكاثون problem solving ctf' : 'academic competition hackathon problem solving ctf',
      other: ar ? 'أخرى' : 'other',
    }
    return events.filter((collegeEvent) => normalizeSearch([
      collegeEvent.title,
      collegeEvent.description,
      collegeEvent.location ?? '',
      collegeEvent.event_type,
      typeLabels[collegeEvent.event_type] ?? '',
      collegeEvent.competition ? competitionKindLabel(collegeEvent.competition.competition_kind, ar) : '',
      collegeEvent.competition ? competitionPublicStatus(collegeEvent.competition, ar) : '',
    ].join(' ')).includes(searchNeedle))
  }, [events, searchNeedle, ar])

  function submitSearch(event: FormEvent) {
    event.preventDefault()
    setActiveQuery(query.trim())
  }

  function clearSearch() {
    setQuery('')
    setActiveQuery('')
  }

  if (loading) return <div className="page-state">{t('sessions.loading')}</div>

  const searching = Boolean(searchNeedle)
  const searchTotal = searchSessions.length + searchEvents.length

  return <div className="home-page">
    <section className="home-hero">
      <div className="home-hero-copy">
        <div className="home-hero-eyebrow">{ar ? 'أرشيف الكلية في مكان واحد' : 'The college archive, in one place'}</div>
        <h1>{ar ? 'مرحبًا بك' : 'Welcome'}</h1>
        <p>{ar ? 'ابحث في الجلسات والفعاليات، واستكشف الأرشيف بسهولة من مكان واحد.' : 'Search sessions and college events, and explore the archive from one place.'}</p>
        <form className="home-search" onSubmit={submitSearch}>
          <input aria-label={ar ? 'ابحث في الأرشيف' : 'Search archive'} placeholder={ar ? 'ابحث عن جلسة، فعالية، مسابقة، متحدث أو تصنيف...' : 'Search for a session, event, competition, speaker, or category...'} value={query} onChange={(event) => setQuery(event.target.value)} />
          <button className="button button-primary" type="submit">{t('common.search')}</button>
        </form>
        <div className="home-hero-actions">
          <Link className="button home-secondary-button" to="/sessions">{ar ? 'استعراض الجلسات' : 'Browse sessions'}</Link>
          <Link className="button home-secondary-button" to="/events">{ar ? 'استعراض الفعاليات' : 'Browse events'}</Link>
        </div>
      </div>
    </section>

    {error && <p className="notice error">{error}</p>}

    {searching ? <section className="home-search-results" aria-live="polite">
      <div className="home-search-results-head">
        <div>
          <span className="home-section-kicker"><Icon name="layers" />{ar ? 'نتائج البحث' : 'Search results'}</span>
          <h2>{ar ? `نتائج «${activeQuery}»` : `Results for “${activeQuery}”`}</h2>
          <p>{ar ? `${searchTotal} نتيجة في الجلسات والفعاليات` : `${searchTotal} result${searchTotal === 1 ? '' : 's'} across sessions and events`}</p>
        </div>
        <button type="button" className="button button-secondary home-search-clear" onClick={clearSearch}>{ar ? 'مسح البحث' : 'Clear search'}</button>
      </div>

      {searchSessions.length > 0 && <div className="home-search-result-group">
        <div className="home-search-result-group-head"><strong>{ar ? 'الجلسات' : 'Sessions'}</strong><span>{searchSessions.length}</span></div>
        <div className="home-search-grid">{searchSessions.map((session) => <SessionCard key={session.id} session={session} />)}</div>
      </div>}

      {searchEvents.length > 0 && <div className="home-search-result-group">
        <div className="home-search-result-group-head"><strong>{ar ? 'الفعاليات والمسابقات' : 'Events & competitions'}</strong><span>{searchEvents.length}</span></div>
        <div className="home-search-grid home-search-events-grid">{searchEvents.map((collegeEvent) => <EventCard key={collegeEvent.id} event={collegeEvent} ar={ar} />)}</div>
      </div>}

      {searchTotal === 0 && <div className="home-empty home-search-empty"><Icon name="layers" /><div><strong>{ar ? 'ما لقينا نتيجة مطابقة' : 'No matching results'}</strong><span>{ar ? 'جرّب كلمة أقصر، اسم المتحدث، التصنيف، المسابقة أو اسم الفعالية.' : 'Try a shorter term, speaker, category, competition, or event name.'}</span></div></div>}
    </section> : <>
      <HomeSessionSection
        icon="bookmark"
        kicker={ar ? 'مهم الآن' : 'Featured'}
        title={ar ? 'الجلسة المثبتة' : 'Pinned session'}
        view="pinned"
        sessions={pinnedSessions}
        emptyTitle={ar ? 'ما في جلسة مثبتة حاليًا' : 'No pinned session right now'}
        emptyText={ar ? 'أول ما يتم تثبيت جلسة من الإدارة ستظهر هنا تلقائيًا.' : 'As soon as a session is pinned by an admin, it will appear here automatically.'}
        ar={ar}
      />

      <HomeSessionSection
        icon="calendar"
        kicker={ar ? 'على الطريق' : 'Coming up'}
        title={ar ? 'جلسات قريبة' : 'Upcoming sessions'}
        view="upcoming"
        sessions={upcomingSessions}
        emptyTitle={ar ? 'ما في جلسات قادمة مضافة الآن' : 'No upcoming sessions yet'}
        emptyText={ar ? 'لما تتم إضافة موعد جديد سيظهر هنا مباشرة.' : 'New scheduled sessions will show up here automatically.'}
        ar={ar}
      />

      <section className="home-section home-events-section">
        <div className="home-section-head">
          <div><span className="home-section-kicker"><Icon name="layers" />{ar ? 'لحظات تستحق الحفظ' : 'Moments worth keeping'}</span><h2>{ar ? 'من فعاليات الكلية' : 'From college events'}</h2></div>
          <Link to="/events" className="home-section-link">{ar ? 'عرض كل الفعاليات' : 'View all events'} <span aria-hidden="true">←</span></Link>
        </div>
        {homeEvents.length ? <div className="home-event-rail">{homeEvents.map((collegeEvent) => <div className="home-event-rail-item" key={collegeEvent.id}><EventCard event={collegeEvent} ar={ar} /></div>)}</div> : <div className="home-empty"><Icon name="layers" /><div><strong>{ar ? 'لسه ما في فعاليات مضافة' : 'No events added yet'}</strong><span>{ar ? 'أول فعالية منشورة وصورها ستظهر هنا.' : 'The first published event and its photos will appear here.'}</span></div></div>}
      </section>

      <HomeSessionSection
        icon="layers"
        kicker={ar ? 'وصلت للأرشيف' : 'Fresh in the archive'}
        title={ar ? 'أضيف حديثًا للأرشيف' : 'Recently added'}
        view="recent"
        sessions={recentSessions}
        emptyTitle={ar ? 'الأرشيف فاضي حاليًا' : 'The archive is empty'}
        emptyText={ar ? 'أول جلسة منشورة ستظهر هنا.' : 'The first published session will appear here.'}
        ar={ar}
      />

      <HomeSessionSection
        icon="chart"
        kicker={ar ? 'اختيارات الجمهور' : 'Community favorites'}
        title={ar ? 'أعلى الجلسات تقييمًا' : 'Top-rated sessions'}
        view="top-rated"
        sessions={topRatedSessions}
        emptyTitle={ar ? 'لسه ما في تقييمات كفاية' : 'No ratings yet'}
        emptyText={ar ? 'بعد أول تقييم، أعلى الجلسات ستظهر هنا.' : 'Once ratings arrive, the highest-rated sessions will appear here.'}
        ar={ar}
      />

      <section className="home-section home-categories-section">
        <div className="home-section-head"><div><span className="home-section-kicker"><Icon name="layers" />{ar ? 'وصول أسرع' : 'Quick access'}</span><h2>{ar ? 'تصنيفات سريعة' : 'Quick categories'}</h2></div><Link to="/sessions" className="home-section-link">{ar ? 'عرض الكل' : 'View all'} <span aria-hidden="true">←</span></Link></div>
        <div className="home-category-grid">
          {categories.map((category) => {
            const count = sessions.filter((session) => session.category_id === category.id).length
            return <Link className="home-category-card" key={category.id} to={`/sessions?category=${encodeURIComponent(category.id)}`}>
              <span className="home-category-icon">{category.name.trim().slice(0, 1).toUpperCase()}</span>
              <span className="home-category-copy"><strong dir="auto">{category.name}</strong><small>{ar ? `${count} جلسة` : `${count} session${count === 1 ? '' : 's'}`}</small></span>
              <span className="home-category-arrow" aria-hidden="true">←</span>
            </Link>
          })}
        </div>
      </section>
    </>}
  </div>
}