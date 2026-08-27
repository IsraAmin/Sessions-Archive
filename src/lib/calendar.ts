import type { Session } from '../types/domain'

function compactUtc(value: string) {
  return new Date(value).toISOString().replace(/[-:]/g, '').replace(/\.\d{3}Z$/, 'Z')
}

function endDate(session: Session) {
  if (session.ends_at) return session.ends_at
  return new Date(new Date(session.starts_at).getTime() + 60 * 60 * 1000).toISOString()
}

export function googleCalendarUrl(session: Session) {
  const params = new URLSearchParams({
    action: 'TEMPLATE',
    text: session.title,
    dates: `${compactUtc(session.starts_at)}/${compactUtc(endDate(session))}`,
    details: session.description,
    location: session.location ?? '',
  })
  return `https://calendar.google.com/calendar/render?${params.toString()}`
}

function escapeIcs(value: string) {
  return value.replace(/\\/g, '\\\\').replace(/\n/g, '\\n').replace(/,/g, '\\,').replace(/;/g, '\\;')
}

export function downloadSessionIcs(session: Session) {
  const content = [
    'BEGIN:VCALENDAR',
    'VERSION:2.0',
    'PRODID:-//Sessions Archive//Calendar//EN',
    'CALSCALE:GREGORIAN',
    'METHOD:PUBLISH',
    'BEGIN:VEVENT',
    `UID:${session.id}@sessions-archive`,
    `DTSTAMP:${compactUtc(new Date().toISOString())}`,
    `DTSTART:${compactUtc(session.starts_at)}`,
    `DTEND:${compactUtc(endDate(session))}`,
    `SUMMARY:${escapeIcs(session.title)}`,
    `DESCRIPTION:${escapeIcs(session.description)}`,
    `LOCATION:${escapeIcs(session.location ?? '')}`,
    'END:VEVENT',
    'END:VCALENDAR',
  ].join('\r\n')

  const blob = new Blob([content], { type: 'text/calendar;charset=utf-8' })
  const url = URL.createObjectURL(blob)
  const anchor = document.createElement('a')
  anchor.href = url
  anchor.download = `${session.slug || 'session'}.ics`
  document.body.appendChild(anchor)
  anchor.click()
  anchor.remove()
  URL.revokeObjectURL(url)
}
