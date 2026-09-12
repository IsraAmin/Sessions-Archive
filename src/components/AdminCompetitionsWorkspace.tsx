import { useEffect, useMemo, useState } from 'react'
import { supabase } from '../lib/supabase'
import type { CollegeEvent, CompetitionDetails } from '../types/domain'
import { useUi } from '../hooks/useUi'
import { Icon } from './Icon'
import { AdminCompetitionPanel } from './AdminCompetitionPanel'

export function AdminCompetitionsWorkspace() {
  const { language } = useUi()
  const ar = language === 'ar'
  const [events, setEvents] = useState<CollegeEvent[]>([])
  const [details, setDetails] = useState<CompetitionDetails[]>([])
  const [selectedId, setSelectedId] = useState('')
  const [query, setQuery] = useState('')
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    let active = true
    async function load() {
      setLoading(true)
      try {
        const [eventsResult, detailsResult] = await Promise.all([
          supabase.from('events').select('*').eq('event_type', 'academic').order('event_date', { ascending: false }).order('created_at', { ascending: false }),
          supabase.from('competition_details').select('*'),
        ])
        if (eventsResult.error) throw eventsResult.error
        if (detailsResult.error) throw detailsResult.error
        if (!active) return
        const nextEvents = (eventsResult.data ?? []) as CollegeEvent[]
        setEvents(nextEvents)
        setDetails((detailsResult.data ?? []) as CompetitionDetails[])
        setSelectedId((current) => current && nextEvents.some((item) => item.id === current) ? current : (nextEvents[0]?.id ?? ''))
      } catch (error) {
        console.error('Could not load academic competitions workspace', error)
      } finally {
        if (active) setLoading(false)
      }
    }
    void load()
    return () => { active = false }
  }, [])

  const competitionIds = useMemo(() => new Set(details.map((item) => item.event_id)), [details])
  const filtered = useMemo(() => {
    const needle = query.trim().toLocaleLowerCase(ar ? 'ar' : 'en')
    if (!needle) return events
    return events.filter((item) => [item.title, item.location ?? '', item.description].join(' ').toLocaleLowerCase(ar ? 'ar' : 'en').includes(needle))
  }, [events, query, ar])
  const selected = events.find((item) => item.id === selectedId) ?? null

  if (loading) return <div className="page-state">{ar ? 'جارٍ تحميل المسابقات الأكاديمية…' : 'Loading academic competitions…'}</div>

  return <section className="admin-competitions-workspace" id="competitions-admin">
    <header className="admin-competitions-head">
      <div><span className="eyebrow">{ar ? 'داخل الفعاليات الأكاديمية' : 'Inside academic events'}</span><h2>{ar ? 'استوديو المسابقات' : 'Competition studio'}</h2><p>{ar ? 'المسابقة الجديدة تنشئيها مباشرة من زر «إضافة فعالية جديدة» فوق. هنا تكملي المراحل، تعدلي البيانات، وتضيفي الفائزين وتنشري النتائج.' : 'Create a new competition directly from “Create new event” above. Use this studio to manage stages, edit details, add winners, and publish results.'}</p></div>
      <span className="admin-competition-count">{details.length} {ar ? 'مسابقة مفعلة' : 'enabled'}</span>
    </header>

    {!events.length ? <div className="competition-workspace-empty"><Icon name="calendar" /><strong>{ar ? 'ما في فعاليات أكاديمية حتى الآن' : 'No academic events yet'}</strong><span>{ar ? 'استخدمي «إضافة فعالية جديدة» فوق، اختاري «أكاديمية»، وبعدها اختاري نوع المسابقة. كل بيانات المسابقة حتظهر ليك قبل الحفظ.' : 'Use “Create new event” above, choose Academic, then choose a competition subtype. Competition fields will appear before you save.'}</span></div> : <div className="admin-competitions-layout">
      <aside className="admin-competition-browser">
        <div className="admin-event-browser-search"><Icon name="layers" /><input value={query} onChange={(event) => setQuery(event.target.value)} placeholder={ar ? 'ابحث في الفعاليات الأكاديمية…' : 'Search academic events…'} /></div>
        <div className="admin-competition-browser-list">{filtered.map((item) => {
          const isCompetition = competitionIds.has(item.id)
          return <button key={item.id} type="button" className={selectedId === item.id ? 'active' : ''} onClick={() => setSelectedId(item.id)}>
            <span className="admin-event-browser-date"><b>{new Date(`${item.event_date}T12:00:00`).getDate()}</b><small>{new Intl.DateTimeFormat(ar ? 'ar-SA' : 'en-US', { month: 'short' }).format(new Date(`${item.event_date}T12:00:00`))}</small></span>
            <span><strong dir="auto">{item.title}</strong><small>{isCompetition ? (ar ? '🏆 قالب مسابقة مفعّل' : '🏆 Competition enabled') : (ar ? 'فعالية أكاديمية عادية' : 'Regular academic event')}</small></span>
          </button>
        })}</div>
      </aside>
      <div className="admin-competition-editor">{selected ? <><div className="admin-competition-selected-head"><div><span>{ar ? 'الفعالية المختارة' : 'Selected event'}</span><h3 dir="auto">{selected.title}</h3></div><small>{new Intl.DateTimeFormat(ar ? 'ar-SA' : 'en-US', { dateStyle: 'medium' }).format(new Date(`${selected.event_date}T12:00:00`))}</small></div><AdminCompetitionPanel key={selected.id} event={selected} /></> : <div className="competition-workspace-empty compact"><Icon name="layers" /><span>{ar ? 'اختاري فعالية أكاديمية.' : 'Choose an academic event.'}</span></div>}</div>
    </div>}
  </section>
}
