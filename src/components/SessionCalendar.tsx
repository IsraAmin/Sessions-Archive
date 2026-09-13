import { useEffect, useMemo, useRef, useState } from 'react'
import { Link } from 'react-router-dom'
import { useUi } from '../hooks/useUi'
import { Icon } from './Icon'

type CalendarSession = { id: string; title: string; starts_at: string }

export function SessionCalendar({ sessions }: { sessions: CalendarSession[] }) {
  const { language, locale } = useUi()
  const today = new Date()
  const syncedInitialMonth = useRef(false)
  const archivedSessions = useMemo(() => {
    const endOfToday = new Date(today.getFullYear(), today.getMonth(), today.getDate() + 1).getTime() - 1
    return [...sessions]
      .filter((session) => new Date(session.starts_at).getTime() <= endOfToday)
      .sort((a, b) => new Date(b.starts_at).getTime() - new Date(a.starts_at).getTime())
  }, [sessions])
  const [cursor, setCursor] = useState(() => new Date(today.getFullYear(), today.getMonth(), 1))

  useEffect(() => {
    if (syncedInitialMonth.current || !archivedSessions.length) return
    const latest = new Date(archivedSessions[0].starts_at)
    setCursor(new Date(latest.getFullYear(), latest.getMonth(), 1))
    syncedInitialMonth.current = true
  }, [archivedSessions])

  const byDay = useMemo(() => {
    const result = new Map<string, CalendarSession[]>()
    for (const session of archivedSessions) {
      const date = new Date(session.starts_at)
      const key = `${date.getFullYear()}-${date.getMonth()}-${date.getDate()}`
      result.set(key, [...(result.get(key) ?? []), session])
    }
    return result
  }, [archivedSessions])

  const first = new Date(cursor.getFullYear(), cursor.getMonth(), 1)
  const startOffset = (first.getDay() + 6) % 7
  const cells = Array.from({ length: 42 }, (_, index) => new Date(cursor.getFullYear(), cursor.getMonth(), 1 - startOffset + index))
  const weekdays = Array.from({ length: 7 }, (_, index) => new Intl.DateTimeFormat(locale, { weekday: 'short' }).format(new Date(2026, 7, 24 + index)))

  function move(months: number) {
    syncedInitialMonth.current = true
    setCursor(new Date(cursor.getFullYear(), cursor.getMonth() + months, 1))
  }

  return <section className="panel learning-calendar">
    <div className="calendar-head">
      <div>
        <span className="eyebrow">{language === 'ar' ? 'الأرشيف حسب التاريخ' : 'Archive by date'}</span>
        <h2>{language === 'ar' ? 'تقويم الجلسات المؤرشفة' : 'Archived sessions calendar'}</h2>
      </div>
      <div className="calendar-nav">
        <button aria-label={language === 'ar' ? 'الشهر السابق' : 'Previous month'} onClick={() => move(-1)}>‹</button>
        <strong>{new Intl.DateTimeFormat(locale, { month: 'long', year: 'numeric' }).format(cursor)}</strong>
        <button aria-label={language === 'ar' ? 'الشهر التالي' : 'Next month'} onClick={() => move(1)}>›</button>
      </div>
    </div>
    <div className="calendar-weekdays">{weekdays.map((day) => <span key={day}>{day}</span>)}</div>
    <div className="calendar-grid">
      {cells.map((date) => {
        const inMonth = date.getMonth() === cursor.getMonth()
        const isToday = date.toDateString() === today.toDateString()
        const key = `${date.getFullYear()}-${date.getMonth()}-${date.getDate()}`
        const daySessions = byDay.get(key) ?? []
        return <div key={date.toISOString()} className={`calendar-day ${inMonth ? '' : 'outside'} ${isToday ? 'today' : ''} ${daySessions.length ? 'has-archive' : ''}`}>
          <span className="calendar-date">{date.getDate()}</span>
          <div className="calendar-events">
            {daySessions.slice(0, 2).map((session) => <Link key={session.id} to={`/sessions/${session.id}`} title={session.title}><i /><span>{session.title}</span></Link>)}
            {daySessions.length > 2 && <small>+{daySessions.length - 2}</small>}
          </div>
        </div>
      })}
    </div>
    {!archivedSessions.length && <div className="calendar-empty"><Icon name="calendar" /><span>{language === 'ar' ? 'لا توجد جلسات مؤرشفة حتى الآن.' : 'There are no archived sessions yet.'}</span></div>}
  </section>
}
