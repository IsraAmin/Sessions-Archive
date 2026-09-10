import { useEffect, useMemo, useState } from 'react'
import { Link, useParams } from 'react-router-dom'
import { eventTypeLabel } from '../components/EventCard'
import { Icon } from '../components/Icon'
import { YouTubePlayer } from '../components/YouTubePlayer'
import { useUi } from '../hooks/useUi'
import { eventImageDisplayUrl, eventVideoPlayerId } from '../lib/eventMedia'
import { publicSupabase } from '../lib/supabase'
import type { CollegeEvent, EventMedia } from '../types/domain'

function GalleryImage({ media, alt, onOpen }: { media: EventMedia; alt: string; onOpen: () => void }) {
  const [failed, setFailed] = useState(false)

  if (failed) {
    return <a className="event-image-fallback" href={media.source_url} target="_blank" rel="noopener noreferrer">
      <Icon name="layers" />
      <span>{alt}</span>
      <small>↗</small>
    </a>
  }

  return <button type="button" className="event-gallery-image" onClick={onOpen} aria-label={alt}>
    <img src={eventImageDisplayUrl(media)} alt={alt} loading="lazy" referrerPolicy="no-referrer" onError={() => setFailed(true)} />
    {media.is_cover && <span className="event-cover-label">Cover</span>}
  </button>
}

export function EventDetailsPage() {
  const { id } = useParams()
  const { language } = useUi()
  const ar = language === 'ar'
  const [event, setEvent] = useState<CollegeEvent | null>(null)
  const [media, setMedia] = useState<EventMedia[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')
  const [lightboxIndex, setLightboxIndex] = useState<number | null>(null)

  useEffect(() => {
    let active = true
    async function load() {
      if (!id) return
      setLoading(true)
      setError('')
      try {
        const [eventResult, mediaResult] = await Promise.all([
          publicSupabase.from('events').select('*').eq('id', id).single(),
          publicSupabase.from('event_media').select('*').eq('event_id', id).order('position').order('created_at'),
        ])
        if (eventResult.error) throw eventResult.error
        if (mediaResult.error) throw mediaResult.error
        if (active) {
          setEvent(eventResult.data as CollegeEvent)
          setMedia((mediaResult.data ?? []) as EventMedia[])
        }
      } catch (loadError) {
        console.error('Could not load event', loadError)
        if (active) setError(ar ? 'تعذر فتح هذه الفعالية، أو أنها غير متاحة للنشر.' : 'This event could not be opened or is not published.')
      } finally {
        if (active) setLoading(false)
      }
    }
    void load()
    return () => { active = false }
  }, [id, ar])

  const images = useMemo(() => media.filter((item) => item.media_type === 'image'), [media])
  const videos = useMemo(() => media.filter((item) => item.media_type === 'video'), [media])

  useEffect(() => {
    if (lightboxIndex === null) return
    function onKey(event: KeyboardEvent) {
      if (event.key === 'Escape') setLightboxIndex(null)
      if (event.key === 'ArrowLeft') setLightboxIndex((current) => current === null ? null : (current + 1) % images.length)
      if (event.key === 'ArrowRight') setLightboxIndex((current) => current === null ? null : (current - 1 + images.length) % images.length)
    }
    document.body.classList.add('event-lightbox-open')
    window.addEventListener('keydown', onKey)
    return () => {
      document.body.classList.remove('event-lightbox-open')
      window.removeEventListener('keydown', onKey)
    }
  }, [lightboxIndex, images.length])

  if (loading) return <div className="page-state">{ar ? 'جارٍ فتح الفعالية…' : 'Loading event…'}</div>
  if (error || !event) return <div className="events-empty"><Icon name="error" /><strong>{ar ? 'الفعالية غير متاحة' : 'Event unavailable'}</strong><span>{error}</span><Link className="button button-primary" to="/events">{ar ? 'العودة للفعاليات' : 'Back to events'}</Link></div>

  const date = new Intl.DateTimeFormat(ar ? 'ar-SA' : 'en-US', { day: 'numeric', month: 'long', year: 'numeric' }).format(new Date(`${event.event_date}T12:00:00`))
  const activeImage = lightboxIndex === null ? null : images[lightboxIndex]

  return <article className="event-details-page">
    <div className="event-details-back"><Link to="/events">← {ar ? 'كل الفعاليات' : 'All events'}</Link></div>

    <header className="event-details-hero">
      <div className="event-details-heading">
        <div className="event-details-badges"><span>{eventTypeLabel(event.event_type, ar)}</span>{event.featured && <span>{ar ? 'فعالية مميزة' : 'Featured event'}</span>}</div>
        <h1 dir="auto">{event.title}</h1>
        <div className="event-details-meta">
          <span><Icon name="calendar" /><time dateTime={event.event_date}>{date}</time></span>
          {event.location && <span><Icon name="layers" /><bdi>{event.location}</bdi></span>}
        </div>
        {event.description && <p dir="auto">{event.description}</p>}
      </div>
      {event.drive_folder_url && <a className="button event-drive-album-button" href={event.drive_folder_url} target="_blank" rel="noopener noreferrer"><Icon name="layers" />{ar ? 'فتح الألبوم الأصلي على Drive' : 'Open original Drive album'} ↗</a>}
    </header>

    {images.length > 0 && <section className="event-detail-section">
      <div className="event-detail-section-head"><div><span>{ar ? 'لحظات من الفعالية' : 'Event moments'}</span><h2>{ar ? 'الصور' : 'Photos'}</h2></div><small>{ar ? `${images.length} صورة` : `${images.length} photos`}</small></div>
      <div className={`event-gallery ${images.length === 1 ? 'event-gallery-single' : ''}`}>
        {images.map((item, index) => <GalleryImage key={item.id} media={item} alt={item.caption || item.title || `${event.title} — ${index + 1}`} onOpen={() => setLightboxIndex(index)} />)}
      </div>
    </section>}

    {videos.length > 0 && <section className="event-detail-section">
      <div className="event-detail-section-head"><div><span>{ar ? 'شاهد من داخل الأرشيف' : 'Watch from the archive'}</span><h2>{ar ? 'الفيديوهات' : 'Videos'}</h2></div><small>{ar ? `${videos.length} فيديو` : `${videos.length} videos`}</small></div>
      <div className="event-video-list">
        {videos.map((item, index) => {
          const title = item.title || item.caption || `${event.title} — ${ar ? 'فيديو' : 'Video'} ${index + 1}`
          const playerId = eventVideoPlayerId(item)
          return <article className="event-video-card" key={item.id}>
            <div className="event-video-title"><span>{String(index + 1).padStart(2, '0')}</span><h3 dir="auto">{title}</h3></div>
            {playerId ? <YouTubePlayer videoId={playerId} title={title} /> : <video controls preload="metadata" src={item.source_url}>{ar ? 'متصفحك لا يدعم تشغيل هذا الفيديو.' : 'Your browser cannot play this video.'}</video>}
            {item.caption && item.caption !== title && <p dir="auto">{item.caption}</p>}
            <a className="text-action event-original-link" href={item.source_url} target="_blank" rel="noopener noreferrer">{ar ? 'فتح المصدر الأصلي' : 'Open original source'} ↗</a>
          </article>
        })}
      </div>
    </section>}

    {!images.length && !videos.length && <div className="events-empty event-details-empty"><Icon name="layers" /><strong>{ar ? 'الألبوم لسه فاضي' : 'The album is empty'}</strong><span>{ar ? 'سيظهر هنا أي صور أو فيديوهات تُضاف لهذه الفعالية.' : 'Photos and videos added to this event will appear here.'}</span></div>}

    {activeImage && lightboxIndex !== null && <div className="event-lightbox" role="dialog" aria-modal="true" aria-label={ar ? 'عارض الصور' : 'Photo viewer'}>
      <button type="button" className="event-lightbox-scrim" onClick={() => setLightboxIndex(null)} aria-label={ar ? 'إغلاق' : 'Close'} />
      <div className="event-lightbox-stage">
        <div className="event-lightbox-top">
          <span>{lightboxIndex + 1} / {images.length}</span>
          <div><a href={activeImage.source_url} target="_blank" rel="noopener noreferrer">{ar ? 'فتح الأصل' : 'Open original'} ↗</a><button type="button" onClick={() => setLightboxIndex(null)} aria-label={ar ? 'إغلاق' : 'Close'}><Icon name="close" /></button></div>
        </div>
        <img src={eventImageDisplayUrl(activeImage)} alt={activeImage.caption || activeImage.title || event.title} referrerPolicy="no-referrer" />
        {(activeImage.caption || activeImage.title) && <p dir="auto">{activeImage.caption || activeImage.title}</p>}
        {images.length > 1 && <><button type="button" className="event-lightbox-nav event-lightbox-prev" onClick={() => setLightboxIndex((lightboxIndex - 1 + images.length) % images.length)} aria-label={ar ? 'الصورة السابقة' : 'Previous image'}>‹</button><button type="button" className="event-lightbox-nav event-lightbox-next" onClick={() => setLightboxIndex((lightboxIndex + 1) % images.length)} aria-label={ar ? 'الصورة التالية' : 'Next image'}>›</button></>}
      </div>
    </div>}
  </article>
}
