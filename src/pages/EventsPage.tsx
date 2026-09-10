import { useEffect, useMemo, useState } from 'react'
import { Link } from 'react-router-dom'
import { EventCard } from '../components/EventCard'
import { Icon } from '../components/Icon'
import { useUi } from '../hooks/useUi'
import { publicSupabase } from '../lib/supabase'
import type { CollegeEvent, CollegeEventWithMedia, EventMedia, EventType } from '../types/domain'

const eventTypes: Array<{ value: 'all' | EventType; ar: string; en: string }> = [
  { value: 'all', ar: 'الكل', en: 'All' },
  { value: 'cultural', ar: 'ثقافية', en: 'Cultural' },
  { value: 'sports', ar: 'رياضية', en: 'Sports' },
  { value: 'initiative', ar: 'مبادرات وإعمار', en: 'Initiatives' },
  { value: 'social', ar: 'اجتماعية', en: 'Social' },
  { value: 'academic', ar: 'أكاديمية', en: 'Academic' },
  { value: 'other', ar: 'أخرى', en: 'Other' },
]

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

        const { data: mediaData, error: mediaError } = await publicSupabase
          .from('event_media')
          .select('*')
          .in('event_id', base.map((event) => event.id))
          .order('position')
          .order('created_at')
        if (mediaError) throw mediaError

        const byEvent = new Map<string, EventMedia[]>()
        for (const item of (mediaData ?? []) as EventMedia[]) {
          const current = byEvent.get(item.event_id) ?? []
          current.push(item)
          byEvent.set(item.event_id, current)
        }

        if (active) setEvents(base.map((event) => ({ ...event, media: byEvent.get(event.id) ?? [] })))
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
      return [event.title, event.description, event.location ?? '']
        .join(' ')
        .toLocaleLowerCase(ar ? 'ar' : 'en')
        .includes(needle)
    })
  }, [events, query, type, ar])

  if (loading) return <div className="page-state">{ar ? 'جارٍ تحميل الفعاليات…' : 'Loading events…'}</div>

  return <div className="events-page">
    <section className="events-hero">
      <div>
        <span className="events-eyebrow"><Icon name="calendar" />{ar ? 'ذاكرة الكلية' : 'College memories'}</span>
        <h1>{ar ? 'الفعاليات' : 'Events'}</h1>
        <p>{ar ? 'صور وفيديوهات الأيام الثقافية والرياضية والمبادرات واللحظات التي تستحق أن تظل محفوظة.' : 'Photos and videos from cultural days, sports, initiatives, and the moments worth keeping.'}</p>
      </div>
      <Link className="button events-hero-link" to="/explore?type=events">{ar ? 'البحث في الأرشيف' : 'Search the archive'}</Link>
    </section>

    <section className="events-toolbar" aria-label={ar ? 'فلترة الفعاليات' : 'Filter events'}>
      <div className="events-search-box"><Icon name="layers" /><input value={query} onChange={(event) => setQuery(event.target.value)} placeholder={ar ? 'ابحث باسم الفعالية أو المكان…' : 'Search by event or place…'} aria-label={ar ? 'البحث في الفعاليات' : 'Search events'} /></div>
      <div className="event-type-chips" role="group" aria-label={ar ? 'نوع الفعالية' : 'Event type'}>
        {eventTypes.map((item) => <button key={item.value} type="button" className={type === item.value ? 'active' : ''} onClick={() => setType(item.value)}>{ar ? item.ar : item.en}</button>)}
      </div>
    </section>

    {error && <p className="notice error">{error}</p>}

    {filtered.length ? <div className="events-grid">{filtered.map((event) => <EventCard key={event.id} event={event} ar={ar} />)}</div> : <div className="events-empty"><Icon name="calendar" /><strong>{ar ? 'ما في فعاليات مطابقة' : 'No matching events'}</strong><span>{ar ? 'غيّر البحث أو نوع الفعالية، أو أضف أول فعالية من لوحة الإدارة.' : 'Change the search or event type, or add the first event from the admin panel.'}</span></div>}
  </div>
}
