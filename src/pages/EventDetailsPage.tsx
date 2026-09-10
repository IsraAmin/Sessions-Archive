import { useEffect, useMemo, useState } from 'react'
import { Link, useParams } from 'react-router-dom'
import { eventTypeLabel } from '../components/EventCard'
import { Icon } from '../components/Icon'
import { useToast } from '../components/ToastProvider'
import { YouTubePlayer } from '../components/YouTubePlayer'
import { useUi } from '../hooks/useUi'
import { eventCoverDisplayUrl, eventImageDisplayUrl, eventVideoPlayerId, googleDriveFolderEmbedUrl } from '../lib/eventMedia'
import { eventShareUrl, publicSupabase } from '../lib/supabase'
import type { CollegeEvent, EventMedia } from '../types/domain'

export function EventDetailsPage() {
  const { id } = useParams()
  const { language } = useUi()
  const { showToast } = useToast()
  const ar = language === 'ar'
  const [event, setEvent] = useState<CollegeEvent | null>(null)
  const [media, setMedia] = useState<EventMedia[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')
  const [galleryIndex, setGalleryIndex] = useState(0)
  const [lightboxIndex, setLightboxIndex] = useState<number | null>(null)
  const [driveExpanded, setDriveExpanded] = useState(false)
  const [touchStartX, setTouchStartX] = useState<number | null>(null)

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
          setGalleryIndex(0)
          setDriveExpanded(false)
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
    if (!images.length) {
      setGalleryIndex(0)
      return
    }
    setGalleryIndex((current) => Math.min(current, images.length - 1))
  }, [images.length])

  useEffect(() => {
    if (lightboxIndex === null || !images.length) return
    function onKey(keyEvent: KeyboardEvent) {
      if (keyEvent.key === 'Escape') setLightboxIndex(null)
      if (keyEvent.key === 'ArrowLeft') setLightboxIndex((current) => current === null ? null : (current - 1 + images.length) % images.length)
      if (keyEvent.key === 'ArrowRight') setLightboxIndex((current) => current === null ? null : (current + 1) % images.length)
    }
    document.body.classList.add('event-lightbox-open')
    window.addEventListener('keydown', onKey)
    return () => {
      document.body.classList.remove('event-lightbox-open')
      window.removeEventListener('keydown', onKey)
    }
  }, [lightboxIndex, images.length])

  function moveGallery(delta: number) {
    if (images.length < 2) return
    setGalleryIndex((current) => (current + delta + images.length) % images.length)
  }

  function finishSwipe(endX: number) {
    if (touchStartX === null) return
    const distance = endX - touchStartX
    setTouchStartX(null)
    if (Math.abs(distance) < 45) return
    moveGallery(distance > 0 ? -1 : 1)
  }

  async function shareEvent() {
    if (!event) return
    const url = eventShareUrl(event.id)
    const title = event.title.replace(/\s+/g, ' ').trim()
    const caption = (event.description ?? '').replace(/\s+/g, ' ').trim().slice(0, 160)
    const shareData = {
      title,
      text: ar
        ? `شوف الفعالية دي في أرشيف ريبيت: ${title}${caption ? ` — ${caption}` : ''}`
        : `Check out this event on أرشيف ريبيت: ${title}${caption ? ` — ${caption}` : ''}`,
      url,
    }

    try {
      if (navigator.share) {
        await navigator.share(shareData)
        return
      }
      await navigator.clipboard.writeText(url)
      showToast({ kind: 'success', title: ar ? 'تم بنجاح' : 'Success', message: ar ? 'تم نسخ رابط الفعالية، جاهز للمشاركة.' : 'Event link copied and ready to share.' })
    } catch (shareError) {
      if (shareError instanceof DOMException && shareError.name === 'AbortError') return
      showToast({ kind: 'error', title: ar ? 'تعذر التنفيذ' : 'Could not complete action', message: ar ? 'تعذر مشاركة الفعالية الآن.' : 'Could not share the event right now.' })
    }
  }

  if (loading) return <div className="page-state">{ar ? 'جارٍ فتح الفعالية…' : 'Loading event…'}</div>
  if (error || !event) return <div className="events-empty"><Icon name="error" /><strong>{ar ? 'الفعالية غير متاحة' : 'Event unavailable'}</strong><span>{error}</span><Link className="button button-primary" to="/events">{ar ? 'العودة للفعاليات' : 'Back to events'}</Link></div>

  const date = new Intl.DateTimeFormat(ar ? 'ar-SA' : 'en-US', { day: 'numeric', month: 'long', year: 'numeric' }).format(new Date(`${event.event_date}T12:00:00`))
  const activeImage = lightboxIndex === null ? null : images[lightboxIndex]
  const selectedCover = images.find((item) => item.is_cover) ?? images[0] ?? null
  const cover = eventCoverDisplayUrl(event.cover_url) ?? (selectedCover ? eventImageDisplayUrl(selectedCover) : null)
  const coverX = event.cover_focus_x ?? 50
  const coverY = event.cover_focus_y ?? 50
  const folderEmbed = event.drive_folder_url ? googleDriveFolderEmbedUrl(event.drive_folder_url) : null
  const galleryImage = images[galleryIndex] ?? null
  const galleryAlt = galleryImage ? (galleryImage.caption || galleryImage.title || `${event.title} — ${galleryIndex + 1}`) : ''

  return <article className="event-details-page event-story-page">
    <div className="event-details-back"><Link to="/events">← {ar ? 'كل الفعاليات' : 'All events'}</Link></div>

    <header className={`event-story-cover ${cover ? 'has-cover' : 'no-cover'}`}>
      {cover ? <img src={cover} alt="" referrerPolicy="no-referrer" style={{ objectPosition: `${coverX}% ${coverY}%` }} /> : <div className="event-story-cover-placeholder"><Icon name="calendar" /></div>}
      <div className="event-story-cover-shade" aria-hidden="true" />
      <div className="event-story-cover-copy">
        <div className="event-details-badges"><span>{eventTypeLabel(event.event_type, ar)}</span>{event.featured && <span>{ar ? 'فعالية مميزة' : 'Featured event'}</span>}</div>
        <h1 dir="auto">{event.title}</h1>
        <div className="event-story-cover-meta"><span><Icon name="calendar" /><time dateTime={event.event_date}>{date}</time></span>{event.location && <span><Icon name="layers" /><bdi>{event.location}</bdi></span>}</div>
      </div>
    </header>

    <section className="event-story-intro">
      <div>
        <span className="events-eyebrow">{ar ? 'عن الفعالية' : 'About the event'}</span>
        <h2>{ar ? 'الحكاية وراء الصور' : 'The story behind the photos'}</h2>
        <p dir="auto">{event.description || (ar ? 'لم تتم إضافة وصف للفعالية بعد.' : 'No event description has been added yet.')}</p>
      </div>
      <div className="event-story-actions">
        <button type="button" className="button button-secondary event-share-button" onClick={() => void shareEvent()}><Icon name="share" />{ar ? 'مشاركة الفعالية' : 'Share event'}</button>
        {event.drive_folder_url && <a className="button event-drive-album-button" href={event.drive_folder_url} target="_blank" rel="noopener noreferrer"><Icon name="layers" />{ar ? 'فتح الأصل على Drive' : 'Open original on Drive'} ↗</a>}
        <span>{images.length ? (ar ? `${images.length} صورة مختارة` : `${images.length} selected photos`) : (ar ? 'بدون صور مختارة' : 'No selected photos')}</span>
        <span>{videos.length ? (ar ? `${videos.length} فيديو` : `${videos.length} videos`) : (ar ? 'بدون فيديو' : 'No videos')}</span>
      </div>
    </section>

    {galleryImage && <section className="event-detail-section event-carousel-section">
      <div className="event-detail-section-head"><div><span>{ar ? 'مختارات من الألبوم' : 'Album highlights'}</span><h2>{ar ? 'الصور' : 'Photos'}</h2></div><small>{galleryIndex + 1} / {images.length}</small></div>
      <div className="event-photo-carousel" onTouchStart={(touchEvent) => setTouchStartX(touchEvent.changedTouches[0]?.clientX ?? null)} onTouchEnd={(touchEvent) => finishSwipe(touchEvent.changedTouches[0]?.clientX ?? 0)}>
        <button type="button" className="event-carousel-stage" onClick={() => setLightboxIndex(galleryIndex)} aria-label={ar ? 'فتح الصورة بالحجم الكامل' : 'Open full-size image'}>
          <img src={eventImageDisplayUrl(galleryImage)} alt={galleryAlt} referrerPolicy="no-referrer" />
          <span className="event-carousel-counter">{galleryIndex + 1} / {images.length}</span>
          {(galleryImage.caption || galleryImage.title) && <span className="event-carousel-caption" dir="auto">{galleryImage.caption || galleryImage.title}</span>}
        </button>
        {images.length > 1 && <>
          <button type="button" className="event-carousel-nav event-carousel-prev" onClick={() => moveGallery(-1)} aria-label={ar ? 'الصورة السابقة' : 'Previous photo'}>‹</button>
          <button type="button" className="event-carousel-nav event-carousel-next" onClick={() => moveGallery(1)} aria-label={ar ? 'الصورة التالية' : 'Next photo'}>›</button>
        </>}
      </div>
      {images.length > 1 && <div className="event-carousel-thumbs" role="tablist" aria-label={ar ? 'اختيار صورة' : 'Choose photo'}>
        {images.map((item, index) => <button key={item.id} type="button" className={index === galleryIndex ? 'active' : ''} onClick={() => setGalleryIndex(index)} aria-label={ar ? `الصورة ${index + 1}` : `Photo ${index + 1}`} aria-selected={index === galleryIndex} role="tab"><img src={eventImageDisplayUrl(item)} alt="" loading="lazy" referrerPolicy="no-referrer" /></button>)}
      </div>}
      {images.length > 1 && <div className="event-carousel-dots" aria-hidden="true">{images.slice(0, 10).map((item, index) => <span key={item.id} className={index === galleryIndex ? 'active' : ''} />)}</div>}
    </section>}

    {folderEmbed && <section className="event-detail-section event-drive-live-section event-drive-collapsible">
      <div className="event-detail-section-head"><div><span>{ar ? 'الألبوم الأصلي' : 'Original album'}</span><h2>{ar ? 'كل الصور على Drive' : 'All photos on Drive'}</h2></div><small>{ar ? 'ألبوم كامل' : 'Full album'}</small></div>
      {!driveExpanded ? <button type="button" className="event-drive-preview" onClick={() => setDriveExpanded(true)}>
        {cover && <img src={cover} alt="" referrerPolicy="no-referrer" style={{ objectPosition: `${coverX}% ${coverY}%` }} />}
        <span className="event-drive-preview-shade" aria-hidden="true" />
        <span className="event-drive-preview-content"><Icon name="layers" /><strong>{ar ? 'استعراض الألبوم الكامل' : 'Browse the full album'}</strong><small>{ar ? 'اضغطي هنا لعرض محتويات مجلد Drive' : 'Open the Drive folder contents here'}</small></span>
      </button> : <>
        <div className="event-drive-live-frame">
          <iframe src={folderEmbed} title={ar ? `ألبوم ${event.title} على Google Drive` : `${event.title} Google Drive album`} loading="lazy" referrerPolicy="strict-origin-when-cross-origin" />
        </div>
        <button type="button" className="event-drive-collapse-button" onClick={() => setDriveExpanded(false)}>{ar ? 'إخفاء الألبوم الكامل' : 'Hide full album'}</button>
      </>}
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

    {!images.length && !videos.length && !folderEmbed && <div className="events-empty event-details-empty"><Icon name="layers" /><strong>{ar ? 'الألبوم لسه فاضي' : 'The album is empty'}</strong><span>{ar ? 'سيظهر هنا أي مجلد Drive أو صور أو فيديوهات تُضاف لهذه الفعالية.' : 'A Drive folder, photos, or videos added to this event will appear here.'}</span></div>}

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
