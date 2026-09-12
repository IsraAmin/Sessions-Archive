import { useEffect, useMemo, useState, type FormEvent } from 'react'
import { useSearchParams } from 'react-router-dom'
import { EventCard } from '../components/EventCard'
import { Icon } from '../components/Icon'
import { SessionCard } from '../components/SessionCard'
import { useUi } from '../hooks/useUi'
import { publicSupabase } from '../lib/supabase'
import type { CollegeEvent, CollegeEventWithMedia, EventMedia, RecordingProvider, SearchSession } from '../types/domain'

type ExploreType = 'all' | 'sessions' | 'events'

function readType(value: string | null): ExploreType {
  return value === 'sessions' || value === 'events' ? value : 'all'
}

function isRecordingProvider(value: string): value is RecordingProvider {
  return ['youtube', 'google_drive', 'whatsapp', 'telegram'].includes(value)
}

export function ExplorePage() {
  const { language } = useUi()
  const ar = language === 'ar'
  const [params, setParams] = useSearchParams()
  const [query, setQuery] = useState(params.get('search') ?? '')
  const activeType = readType(params.get('type'))
  const appliedQuery = params.get('search')?.trim() ?? ''
  const [sessions, setSessions] = useState<SearchSession[]>([])
  const [events, setEvents] = useState<CollegeEventWithMedia[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')

  useEffect(() => { setQuery(appliedQuery) }, [appliedQuery])

  useEffect(() => {
    let active = true
    async function load() {
      setLoading(true)
      setError('')
      try {
        const [sessionsResult, eventsResult] = await Promise.all([
          publicSupabase.rpc('search_sessions', { search_text: appliedQuery || undefined, category_filter: undefined }),
          publicSupabase.from('events').select('*').eq('status', 'published').order('featured', { ascending: false }).order('event_date', { ascending: false }),
        ])
        if (sessionsResult.error) throw sessionsResult.error
        if (eventsResult.error) throw eventsResult.error

        const baseSessions = (sessionsResult.data ?? []) as SearchSession[]
        const baseEvents = (eventsResult.data ?? []) as CollegeEvent[]
        let nextSessions = baseSessions

        if (baseSessions.length) {
          const videoResult = await publicSupabase.from('session_videos').select('session_id,video_provider').in('session_id', baseSessions.map((session) => session.id))
          if (videoResult.error) throw videoResult.error
          const providersBySession = new Map<string, Set<RecordingProvider>>()
          for (const row of videoResult.data ?? []) {
            const provider = String(row.video_provider)
            if (!isRecordingProvider(provider)) continue
            const current = providersBySession.get(row.session_id) ?? new Set<RecordingProvider>()
            current.add(provider)
            providersBySession.set(row.session_id, current)
          }
          nextSessions = baseSessions.map((session) => ({
            ...session,
            recording_providers: [...(providersBySession.get(session.id) ?? new Set<RecordingProvider>())],
          }))
        }

        let eventMedia: EventMedia[] = []
        if (baseEvents.length) {
          const mediaResult = await publicSupabase.from('event_media').select('*').in('event_id', baseEvents.map((event) => event.id)).order('position')
          if (mediaResult.error) throw mediaResult.error
          eventMedia = (mediaResult.data ?? []) as EventMedia[]
        }

        const mediaByEvent = new Map<string, EventMedia[]>()
        for (const item of eventMedia) {
          const current = mediaByEvent.get(item.event_id) ?? []
          current.push(item)
          mediaByEvent.set(item.event_id, current)
        }

        if (active) {
          setSessions(nextSessions)
          setEvents(baseEvents.map((event) => ({ ...event, media: mediaByEvent.get(event.id) ?? [] })))
        }
      } catch (loadError) {
        console.error('Could not search archive', loadError)
        if (active) setError(ar ? 'تعذر البحث في الأرشيف الآن.' : 'Could not search the archive right now.')
      } finally {
        if (active) setLoading(false)
      }
    }
    void load()
    return () => { active = false }
  }, [appliedQuery, ar])

  const filteredEvents = useMemo(() => {
    if (!appliedQuery) return events
    const needle = appliedQuery.toLocaleLowerCase(ar ? 'ar' : 'en')
    return events.filter((event) => [event.title, event.description, event.location ?? ''].join(' ').toLocaleLowerCase(ar ? 'ar' : 'en').includes(needle))
  }, [events, appliedQuery, ar])

  function submit(event: FormEvent) {
    event.preventDefault()
    const next = new URLSearchParams(params)
    const value = query.trim()
    if (value) next.set('search', value)
    else next.delete('search')
    setParams(next)
  }

  function setType(type: ExploreType) {
    const next = new URLSearchParams(params)
    if (type === 'all') next.delete('type')
    else next.set('type', type)
    setParams(next)
  }

  const showSessions = activeType !== 'events'
  const showEvents = activeType !== 'sessions'
  const total = (showSessions ? sessions.length : 0) + (showEvents ? filteredEvents.length : 0)

  return <div className="explore-page">
    <header className="explore-header">
      <span className="events-eyebrow"><Icon name="layers" />{ar ? 'بحث واحد لكل الأرشيف' : 'One search for the archive'}</span>
      <h1>{ar ? 'استكشف الأرشيف' : 'Explore the archive'}</h1>
      <p>{ar ? 'ابحث في الجلسات والفعاليات من مكان واحد، ثم اختر نوع المحتوى الذي تريد الوصول إليه.' : 'Search sessions and college events in one place, then narrow by the content you want.'}</p>
      <form className="explore-search" onSubmit={submit}>
        <input value={query} onChange={(event) => setQuery(event.target.value)} placeholder={ar ? 'ابحث عن جلسة، فعالية، متحدث أو مكان…' : 'Search for a session, event, speaker, or place…'} aria-label={ar ? 'البحث في الأرشيف' : 'Search archive'} />
        <button className="button button-primary" type="submit">{ar ? 'بحث' : 'Search'}</button>
      </form>
      <div className="explore-type-tabs" role="group" aria-label={ar ? 'نوع المحتوى' : 'Content type'}>
        <button type="button" className={activeType === 'all' ? 'active' : ''} onClick={() => setType('all')}>{ar ? 'الكل' : 'All'}</button>
        <button type="button" className={activeType === 'sessions' ? 'active' : ''} onClick={() => setType('sessions')}>{ar ? 'الجلسات' : 'Sessions'}</button>
        <button type="button" className={activeType === 'events' ? 'active' : ''} onClick={() => setType('events')}>{ar ? 'الفعاليات' : 'Events'}</button>
      </div>
    </header>

    {error && <p className="notice error">{error}</p>}
    {loading ? <div className="page-state">{ar ? 'جارٍ البحث…' : 'Searching…'}</div> : <>
      <div className="explore-result-summary"><strong>{total}</strong><span>{appliedQuery ? (ar ? `نتيجة لـ «${appliedQuery}»` : `results for “${appliedQuery}”`) : (ar ? 'عنصر في الأرشيف' : 'items in the archive')}</span></div>

      {showSessions && <section className="explore-section">
        <div className="event-detail-section-head"><div><span>{ar ? 'المحتوى التعليمي' : 'Learning archive'}</span><h2>{ar ? 'الجلسات' : 'Sessions'}</h2></div><small>{sessions.length}</small></div>
        {sessions.length ? <div className="sessions-grid">{sessions.map((session) => <SessionCard key={session.id} session={session} />)}</div> : <div className="events-empty compact"><Icon name="calendar" /><strong>{ar ? 'ما في جلسات مطابقة' : 'No matching sessions'}</strong></div>}
      </section>}

      {showEvents && <section className="explore-section">
        <div className="event-detail-section-head"><div><span>{ar ? 'ذاكرة الكلية' : 'College memories'}</span><h2>{ar ? 'الفعاليات' : 'Events'}</h2></div><small>{filteredEvents.length}</small></div>
        {filteredEvents.length ? <div className="events-grid">{filteredEvents.map((collegeEvent) => <EventCard key={collegeEvent.id} event={collegeEvent} ar={ar} />)}</div> : <div className="events-empty compact"><Icon name="layers" /><strong>{ar ? 'ما في فعاليات مطابقة' : 'No matching events'}</strong></div>}
      </section>}
    </>}
  </div>
}