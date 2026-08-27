import { useMemo, useState } from 'react'
import { Link } from 'react-router-dom'
import { useUi } from '../hooks/useUi'
import { Icon } from './Icon'

type CalendarSession = { id: string; title: string; starts_at: string }

export function SessionCalendar({ sessions }: { sessions: CalendarSession[] }) {
  const { language, locale } = useUi()
  const today = new Date()
  const [cursor, setCursor] = useState(() => new Date(today.getFullYear(), today.getMonth(), 1))

  const futureSessions = useMemo(() => sessions.filter((session) => new Date(session.starts_at).getTime() >= new Date(today.getFullYear(), today.getMonth(), today.getDate()).getTime()), [sessions])
  const byDay = useMemo(() => {
    const result = new Map<string, CalendarSession[]>()
    for (const session of futureSessions) {
      const date = new Date(session.starts_at)
      const key = `${date.getFullYear()}-${date.getMonth()}-${date.getDate()}`
      result.set(key, [...(result.get(key) ?? []), session])
    }
    return result
  }, [futureSessions])

  const first = new Date(cursor.getFullYear(), cursor.getMonth(), 1)
  const startOffset = (first.getDay() + 6) % 7
  const cells = Array.from({ length: 42 }, (_, index) => new Date(cursor.getFullYear(), cursor.getMonth(), 1 - startOffset + index))
  const weekdays = Array.from({ length: 7 }, (_, index) => new Intl.DateTimeFormat(locale, { weekday: 'short' }).format(new Date(2026, 7, 24 + index)))

  function move(months: number) { setCursor(new Date(cursor.getFullYear(), cursor.getMonth() + months, 1)) }

  return <section className="panel learning-calendar">
    <div className="calendar-head">
      <div><span className="eyebrow">{language === 'ar' ? 'تقويمي' : 'My calendar'}</span><h2>{language === 'ar' ? 'السيشنات القادمة' : 'Upcoming sessions'}</h2></div>
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
        return <div key={date.toISOString()} className={`calendar-day ${inMonth ? '' : 'outside'} ${isToday ? 'today' : ''}`}>
          <span className="calendar-date">{date.getDate()}</span>
          <div className="calendar-events">{daySessions.slice(0, 2).map((session) => <Link key={session.id} to={`/sessions/${session.id}`} title={session.title}><i /><span>{session.title}</span></Link>)}{daySessions.length > 2 && <small>+{daySessions.length - 2}</small>}</div>
        </div>
      })}
    </div>
    {!futureSessions.length && <div className="calendar-empty"><Icon name="calendar" /><span>{language === 'ar' ? 'لا توجد سيشنات قادمة في تقويمك. سجّل في سيشن لتظهر هنا.' : 'No upcoming sessions yet. Register for a session to see it here.'}</span></div>}
  </section>
}
