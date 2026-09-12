import { useEffect, useMemo, useState } from 'react'
import { Link } from 'react-router-dom'
import { eventTypeLabel } from '../components/EventCard'
import { Icon } from '../components/Icon'
import { useUi } from '../hooks/useUi'
import { competitionKindLabel, competitionPublicStatus } from '../lib/competition'
import { eventCoverDisplayUrl, eventImageDisplayUrl } from '../lib/eventMedia'
import { publicSupabase } from '../lib/supabase'
import type { CollegeEvent, CollegeEventWithMedia, CompetitionDetails, EventMedia, EventType } from '../types/domain'

const eventTypes: Array<{ value: 'all' | EventType; ar: string; en: string }> = [
  { value: 'all', ar: 'الكل', en: 'All' },
  { value: 'cultural', ar: 'ثقافية', en: 'Cultural' },
  { value: 'sports', ar: 'رياضية', en: 'Sports' },
  { value: 'initiative', ar: 'مبادرات وإعمار', en: 'Initiatives' },
  { value: 'social', ar: 'اجتماعية', en: 'Social' },
  { value: 'academic', ar: 'أكاديمية', en: 'Academic' },
  { value: 'other', ar: 'أخرى', en: 'Other' },
]

function fallbackCover(event: CollegeEventWithMedia) {
  const images = event.media.filter((item) => item.media_type === 'image')
  return images.find((item) => item.is_cover) ?? images[0] ?? null
}

function coverUrl(event: CollegeEventWithMedia) {
  return eventCoverDisplayUrl(event.cover_url) ?? (fallbackCover(event) ? eventImageDisplayUrl(fallbackCover(event) as EventMedia) : null)
}

function eventCounts(event: CollegeEventWithMedia, ar: boolean) {
  const photos = event.media.filter((item) => item.media_type === 'image').length
  const videos = event.media.filter((item) => item.media_type === 'video').length
  const parts: string[] = []
  if (photos) parts.push(ar ? `${photos} صورة` : `${photos} photos`)
  if (videos) parts.push(ar ? `${videos} فيديو` : `${videos} videos`)
  if (event.drive_folder_url) parts.push(ar ? 'ألبوم Drive مباشر' : 'Live Drive album')
  return parts
}

function EventLead({ event, ar }: { event: CollegeEventWithMedia; ar: boolean }) {
  const image = coverUrl(event)
  const date = new Date(`${event.event_date}T12:00:00`)
  const month = new Intl.DateTimeFormat(ar ? 'ar-SA' : 'en-US', { month: 'short' }).format(date)
  const counts = eventCounts(event, ar)
  const x = event.cover_focus_x ?? 50
  const y = event.cover_focus_y ?? 50

  return <Link to={`/events/${event.id}`} className={`event-editorial-lead ${image ? 'has-image' : 'no-image'}`}>
    <div className="event-editorial-lead-visual">
      {image ? <img src={image} alt="" loading="eager" referrerPolicy="no-referrer" style={{ objectPosition: `${x}% ${y}%` }} /> : <div className="event-editorial-placeholder"><Icon name="calendar" /></div>}
      <div className="event-editorial-date" aria-hidden="true"><strong>{String(date.getDate()).padStart(2, '0')}</strong><span>{month}</span></div>
    </div>
    <div className="event-editorial-lead-copy">
      <div className="event-editorial-kickers"><span>{eventTypeLabel(event.event_type, ar)}</span>{event.competition ? <em>🏆 {competitionKindLabel(event.competition.competition_kind, ar)}</em> : event.featured && <em>{ar ? 'مميزة' : 'Featured'}</em>}</div>
      <h2 dir="auto">{event.title}</h2>
      {event.competition && <span className="event-memory-competition">{competitionPublicStatus(event.competition, ar)}</span>}
      {event.description && <p dir="auto">{event.description.slice(0, 230)}{event.description.length > 230 ? '…' : ''}</p>}
      <div className="event-editorial-meta">
        {event.location && <span dir="auto">{event.location}</span>}
        {counts.map((item) => <span key={item}>{item}</span>)}
      </div>
      <span className="event-editorial-open">{event.competition ? (ar ? 'افتح تفاصيل المسابقة' : 'Open competition') : (ar ? 'افتح الذكرى' : 'Open the memory')} <b aria-hidden="true">←</b></span>
    </div>
  </Link>
}

function EventChapter({ event, ar, index }: { event: CollegeEventWithMedia; ar: boolean; index: number }) {
  const image = coverUrl(event)
  const date = new Date(`${event.event_date}T12:00:00`)
  const dateLabel = new Intl.DateTimeFormat(ar ? 'ar-SA' : 'en-US', { day: 'numeric', month: 'short', year: 'numeric' }).format(date)
  const counts = eventCounts(event, ar)
  const x = event.cover_focus_x ?? 50
  const y = event.cover_focus_y ?? 50

  return <Link to={`/events/${event.id}`} className="event-memory-chapter">
    <div className="event-memory-index" aria-hidden="true">{String(index).padStart(2, '0')}</div>
    <div className="event-memory-thumb">
      {image ? <img src={image} alt="" loading="lazy" referrerPolicy="no-referrer" style={{ objectPosition: `${x}% ${y}%` }} /> : <span><Icon name="calendar" /></span>}
    </div>
    <div className="event-memory-copy">
      <div className="event-memory-topline"><time dateTime={event.event_date}>{dateLabel}</time><span>{eventTypeLabel(event.event_type, ar)}</span></div>
      <h3 dir="auto">{event.title}</h3>
      {event.competition && <span className="event-memory-competition">🏆 {competitionKindLabel(event.competition.competition_kind, ar)} · {competitionPublicStatus(event.competition, ar)}</span>}
      {event.description && <p dir="auto">{event.description.slice(0, 150)}{event.description.length > 150 ? '…' : ''}</p>}
      <div className="event-memory-meta">{event.location && <span dir="auto">{event.location}</span>}{counts.map((item) => <span key={item}>{item}</span>)}</div>
    </div>
    <span className="event-memory-arrow" aria-hidden="true">←</span>
  </Link>
}

export function EventsPage() {
  const { language } = useUi()
  const ar = language === 'ar'
  const [events, setEvents] = useState<CollegeEventWithMedia[]>([])
  const [query, setQuery] = useState('')
  const [type, setType] = useState<'all' | EventType>('all')
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')

  useEffect(() => {
    let active = true
    async function load() {
      setLoading(true)
      setError('')
      try {
        const { data: eventData, error: eventError } = await publicSupabase
          .from('events')
          .select('*')
          .eq('status', 'published')
          .order('featured', { ascending: false })
          .order('event_date', { ascending: false })
        if (eventError) throw eventError

        const base = (eventData ?? []) as CollegeEvent[]
        if (!base.length) {
          if (active) setEvents([])
          return
        }

        const ids = base.map((event) => event.id)
        const [mediaResult, competitionResult] = await Promise.all([
          publicSupabase.from('event_media').select('*').in('event_id', ids).order('position').order('created_at'),
          publicSupabase.from('competition_details').select('*').in('event_id', ids),
        ])
        if (mediaResult.error) throw mediaResult.error
        if (competitionResult.error) throw competitionResult.error

        const byEvent = new Map<string, EventMedia[]>()
        for (const item of (mediaResult.data ?? []) as EventMedia[]) {
          const current = byEvent.get(item.event_id) ?? []
          current.push(item)
          byEvent.set(item.event_id, current)
        }
        const competitions = new Map<string, CompetitionDetails>(((competitionResult.data ?? []) as CompetitionDetails[]).map((item) => [item.event_id, item]))

        if (active) setEvents(base.map((event) => ({ ...event, media: byEvent.get(event.id) ?? [], competition: competitions.get(event.id) ?? null })))
      } catch (loadError) {
        console.error('Could not load events', loadError)
        if (active) setError(ar ? 'تعذر تحميل الفعاليات الآن. حاول مرة أخرى.' : 'Could not load events right now. Please try again.')
      } finally {
        if (active) setLoading(false)
      }
    }

    void load()
    return () => { active = false }
  }, [ar])

  const filtered = useMemo(() => {
    const needle = query.trim().toLocaleLowerCase(ar ? 'ar' : 'en')
    return events.filter((event) => {
      if (type !== 'all' && event.event_type !== type) return false
      if (!needle) return true
      const competitionTerms = event.competition ? `${competitionKindLabel(event.competition.competition_kind, ar)} ${competitionPublicStatus(event.competition, ar)}` : ''
      return [event.title, event.description, event.location ?? '', competitionTerms]
        .join(' ')
        .toLocaleLowerCase(ar ? 'ar' : 'en')
        .includes(needle)
    })
  }, [events, query, type, ar])

  if (loading) return <div className="page-state">{ar ? 'جارٍ تحميل الفعاليات…' : 'Loading events…'}</div>

  const lead = filtered[0] ?? null
  const chapters = filtered.slice(1)

  return <div className="events-page events-editorial-page">
    <header className="events-editorial-header">
      <div>
        <span className="events-eyebrow"><Icon name="calendar" />{ar ? 'ذاكرة الكلية' : 'College memories'}</span>
        <h1>{ar ? 'فعاليات عشناها، محفوظة هنا' : 'Moments we lived, kept here'}</h1>
        <p>{ar ? 'أيام ثقافية، رياضة، مبادرات، مسابقات أكاديمية ولحظات من الكلية — مرتبة كحكايات، مش مجرد ملفات.' : 'Cultural days, sports, initiatives, academic competitions, and campus moments — arranged as stories, not just files.'}</p>
      </div>
      <Link className="events-editorial-search-link" to="/explore?type=events">{ar ? 'بحث شامل' : 'Full search'} <span aria-hidden="true">↗</span></Link>
    </header>

    <section className="events-editorial-filter" aria-label={ar ? 'فلترة الفعاليات' : 'Filter events'}>
      <div className="events-search-box"><Icon name="layers" /><input value={query} onChange={(event) => setQuery(event.target.value)} placeholder={ar ? 'ابحث باسم الفعالية، المسابقة أو المكان…' : 'Search by event, competition, or place…'} aria-label={ar ? 'البحث في الفعاليات' : 'Search events'} /></div>
      <div className="event-type-chips" role="group" aria-label={ar ? 'نوع الفعالية' : 'Event type'}>
        {eventTypes.map((item) => <button key={item.value} type="button" className={type === item.value ? 'active' : ''} onClick={() => setType(item.value)}>{ar ? item.ar : item.en}</button>)}
      </div>
    </section>

    {error && <p className="notice error">{error}</p>}

    {lead ? <>
      <EventLead event={lead} ar={ar} />
      {chapters.length > 0 && <section className="event-memory-index-list">
        <div className="event-memory-list-heading"><span>{ar ? 'من الأحدث للأقدم' : 'Newest to oldest'}</span><strong>{ar ? `${filtered.length} فعالية` : `${filtered.length} events`}</strong></div>
        <div className="event-memory-chapters">{chapters.map((event, index) => <EventChapter key={event.id} event={event} ar={ar} index={index + 2} />)}</div>
      </section>}
    </> : <div className="events-empty"><Icon name="calendar" /><strong>{ar ? 'ما في فعاليات مطابقة' : 'No matching events'}</strong><span>{ar ? 'غيّر البحث أو نوع الفعالية، أو أضف أول فعالية من لوحة الإدارة.' : 'Change the search or event type, or add the first event from the admin panel.'}</span></div>}
  </div>
}
