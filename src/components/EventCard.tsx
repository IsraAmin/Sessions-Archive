import { Link } from 'react-router-dom'
import { Icon } from './Icon'
import { eventCoverDisplayUrl, eventImageDisplayUrl } from '../lib/eventMedia'
import type { CollegeEventWithMedia, EventMedia, EventType } from '../types/domain'

const typeLabels: Record<EventType, { ar: string; en: string }> = {
  cultural: { ar: 'ثقافية', en: 'Cultural' },
  sports: { ar: 'رياضية', en: 'Sports' },
  initiative: { ar: 'مبادرات وإعمار', en: 'Initiatives' },
  social: { ar: 'اجتماعية', en: 'Social' },
  academic: { ar: 'أكاديمية', en: 'Academic' },
  other: { ar: 'أخرى', en: 'Other' },
}

export function eventTypeLabel(type: EventType, ar: boolean) {
  return ar ? typeLabels[type].ar : typeLabels[type].en
}

function coverFor(event: CollegeEventWithMedia) {
  const images = event.media.filter((item) => item.media_type === 'image')
  return images.find((item) => item.is_cover) ?? images[0] ?? null
}

function EventCover({ event, media }: { event: CollegeEventWithMedia; media: EventMedia | null }) {
  const src = eventCoverDisplayUrl(event.cover_url) ?? (media ? eventImageDisplayUrl(media) : null)
  if (!src) {
    return <div className="event-card-cover event-card-cover-empty" aria-hidden="true"><Icon name="calendar" /></div>
  }

  const x = event.cover_focus_x ?? 50
  const y = event.cover_focus_y ?? 50
  return <div className="event-card-cover">
    <img src={src} alt="" loading="lazy" referrerPolicy="no-referrer" style={{ objectPosition: `${x}% ${y}%` }} />
  </div>
}

export function EventCard({ event, ar }: { event: CollegeEventWithMedia; ar: boolean }) {
  const cover = coverFor(event)
  const imageCount = event.media.filter((item) => item.media_type === 'image').length
  const videoCount = event.media.filter((item) => item.media_type === 'video').length
  const date = new Intl.DateTimeFormat(ar ? 'ar-SA' : 'en-US', { day: 'numeric', month: 'short', year: 'numeric' }).format(new Date(`${event.event_date}T12:00:00`))

  return <Link to={`/events/${event.id}`} className="event-card">
    <EventCover event={event} media={cover} />
    <div className="event-card-overlay" aria-hidden="true" />
    <div className="event-card-topline">
      <span className="event-type-pill">{eventTypeLabel(event.event_type, ar)}</span>
      {event.featured && <span className="event-featured-pill">{ar ? 'مميزة' : 'Featured'}</span>}
    </div>
    <div className="event-card-content">
      <time dateTime={event.event_date}>{date}</time>
      <h3 dir="auto">{event.title}</h3>
      {event.location && <p dir="auto">{event.location}</p>}
      <div className="event-card-counts">
        {imageCount > 0 && <span><Icon name="layers" />{ar ? `${imageCount} صورة` : `${imageCount} photos`}</span>}
        {videoCount > 0 && <span><Icon name="play" />{ar ? `${videoCount} فيديو` : `${videoCount} videos`}</span>}
        {event.drive_folder_url && <span><Icon name="layers" />{ar ? 'ألبوم Drive' : 'Drive album'}</span>}
      </div>
    </div>
  </Link>
}
