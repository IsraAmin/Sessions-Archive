import { useEffect, useMemo, useState, type FormEvent } from 'react'
import { useAuth } from '../hooks/useAuth'
import { useUi } from '../hooks/useUi'
import { errorMessage } from '../lib/errors'
import { eventImageDisplayUrl, parseEventImageSource, parseEventVideoSource } from '../lib/eventMedia'
import { supabase } from '../lib/supabase'
import type { CollegeEvent, EventMedia, EventStatus, EventType } from '../types/domain'
import { ConfirmDialog } from './ConfirmDialog'
import { Icon } from './Icon'
import { useToast } from './ToastProvider'

const types: Array<{ value: EventType; ar: string; en: string }> = [
  { value: 'cultural', ar: 'ثقافية', en: 'Cultural' },
  { value: 'sports', ar: 'رياضية', en: 'Sports' },
  { value: 'initiative', ar: 'مبادرات وإعمار', en: 'Initiatives & renovation' },
  { value: 'social', ar: 'اجتماعية', en: 'Social' },
  { value: 'academic', ar: 'أكاديمية', en: 'Academic' },
  { value: 'other', ar: 'أخرى', en: 'Other' },
]

function slugify(value: string) {
  const normalized = value.normalize('NFKD').toLowerCase().replace(/[\u0300-\u036f]/g, '').replace(/[^\p{L}\p{N}]+/gu, '-').replace(/^-+|-+$/g, '').replace(/-{2,}/g, '-')
  return normalized || `event-${Date.now().toString(36)}`
}

function lines(value: string) {
  return value.split(/\r?\n/).map((line) => line.trim()).filter(Boolean)
}

export function AdminEventsPanel() {
  const { user } = useAuth()
  const { language } = useUi()
  const { showToast } = useToast()
  const ar = language === 'ar'
  const [events, setEvents] = useState<CollegeEvent[]>([])
  const [media, setMedia] = useState<EventMedia[]>([])
  const [selectedId, setSelectedId] = useState('')
  const [imageUrls, setImageUrls] = useState('')
  const [videoUrls, setVideoUrls] = useState('')
  const [makeFirstCover, setMakeFirstCover] = useState(true)
  const [busy, setBusy] = useState(false)
  const [deleteTarget, setDeleteTarget] = useState<CollegeEvent | null>(null)

  function success(message: string) { showToast({ kind: 'success', title: ar ? 'تم بنجاح' : 'Success', message }) }
  function fail(error: unknown) { showToast({ kind: 'error', title: ar ? 'تعذر التنفيذ' : 'Could not complete action', message: errorMessage(error) }) }

  async function load() {
    try {
      const [eventResult, mediaResult] = await Promise.all([
        supabase.from('events').select('*').order('event_date', { ascending: false }).order('created_at', { ascending: false }),
        supabase.from('event_media').select('*').order('position').order('created_at'),
      ])
      if (eventResult.error) throw eventResult.error
      if (mediaResult.error) throw mediaResult.error
      const nextEvents = (eventResult.data ?? []) as CollegeEvent[]
      setEvents(nextEvents)
      setMedia((mediaResult.data ?? []) as EventMedia[])
      setSelectedId((current) => current && nextEvents.some((event) => event.id === current) ? current : (nextEvents[0]?.id ?? ''))
    } catch (error) { fail(error) }
  }

  useEffect(() => { void load() }, [])

  const selected = events.find((event) => event.id === selectedId) ?? null
  const selectedMedia = useMemo(() => media.filter((item) => item.event_id === selectedId), [media, selectedId])
  const selectedImages = selectedMedia.filter((item) => item.media_type === 'image')
  const selectedVideos = selectedMedia.filter((item) => item.media_type === 'video')

  async function createEvent(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    const form = event.currentTarget
    const values = new FormData(form)
    const title = String(values.get('title') || '').trim()
    const eventDate = String(values.get('event_date') || '')
    const description = String(values.get('description') || '').trim()
    if (title.length < 2 || !eventDate) return fail(new Error(ar ? 'اكتب اسم الفعالية وتاريخها.' : 'Add the event name and date.'))

    setBusy(true)
    try {
      const payload = {
        title,
        slug: slugify(String(values.get('slug') || title)),
        description,
        event_type: String(values.get('event_type') || 'other') as EventType,
        event_date: eventDate,
        location: String(values.get('location') || '').trim() || null,
        drive_folder_url: String(values.get('drive_folder_url') || '').trim() || null,
        featured: values.get('featured') === 'on',
        status: String(values.get('status') || 'published') as EventStatus,
        created_by: user?.id ?? null,
      }
      const { data, error } = await supabase.from('events').insert(payload).select('*').single()
      if (error) throw error
      form.reset()
      success(ar ? 'تمت إضافة الفعالية. أضف صورها وفيديوهاتها من القسم المجاور.' : 'Event added. Add its photos and videos from the media section.')
      await load()
      if (data?.id) setSelectedId(data.id)
    } catch (error) { fail(error) }
    finally { setBusy(false) }
  }

  async function updateSelected(patch: Partial<Pick<CollegeEvent, 'status' | 'featured'>>) {
    if (!selected) return
    setBusy(true)
    try {
      const { error } = await supabase.from('events').update({ ...patch, updated_at: new Date().toISOString() }).eq('id', selected.id)
      if (error) throw error
      success(ar ? 'تم تحديث الفعالية.' : 'Event updated.')
      await load()
    } catch (error) { fail(error) }
    finally { setBusy(false) }
  }

  async function addMedia() {
    if (!selected) return
    const imageSources = lines(imageUrls).map(parseEventImageSource)
    const videoSources = lines(videoUrls).map(parseEventVideoSource)
    const invalidImages = imageSources.filter((item) => !item).length
    const invalidVideos = videoSources.filter((item) => !item).length
    if (invalidImages || invalidVideos) return fail(new Error(ar ? 'في رابط غير صالح. استخدم رابط Google Drive لملف واحد أو رابط صورة/فيديو عام.' : 'One or more links are invalid. Use an individual Google Drive file link or a public image/video URL.'))

    const parsedImages = imageSources.filter((item): item is NonNullable<typeof item> => Boolean(item))
    const parsedVideos = videoSources.filter((item): item is NonNullable<typeof item> => Boolean(item))
    if (!parsedImages.length && !parsedVideos.length) return fail(new Error(ar ? 'أضف رابط صورة أو فيديو واحد على الأقل.' : 'Add at least one photo or video link.'))

    setBusy(true)
    try {
      const start = selectedMedia.reduce((max, item) => Math.max(max, item.position), 0) + 1
      if (makeFirstCover && parsedImages.length && selectedImages.some((item) => item.is_cover)) {
        const { error } = await supabase.from('event_media').update({ is_cover: false }).eq('event_id', selected.id).eq('media_type', 'image')
        if (error) throw error
      }

      const rows = [
        ...parsedImages.map((item, index) => ({
          event_id: selected.id,
          media_type: 'image' as const,
          provider: item.provider,
          source_url: item.sourceUrl,
          source_id: item.sourceId,
          title: null,
          caption: null,
          position: start + index,
          is_cover: makeFirstCover && index === 0,
        })),
        ...parsedVideos.map((item, index) => ({
          event_id: selected.id,
          media_type: 'video' as const,
          provider: item.provider,
          source_url: item.sourceUrl,
          source_id: item.sourceId,
          title: null,
          caption: null,
          position: start + parsedImages.length + index,
          is_cover: false,
        })),
      ]
      const { error } = await supabase.from('event_media').insert(rows)
      if (error) throw error
      setImageUrls('')
      setVideoUrls('')
      success(ar ? `تمت إضافة ${rows.length} ملف للفعالية.` : `${rows.length} media items added.`)
      await load()
    } catch (error) { fail(error) }
    finally { setBusy(false) }
  }

  async function makeCover(item: EventMedia) {
    if (!selected || item.media_type !== 'image') return
    setBusy(true)
    try {
      const clear = await supabase.from('event_media').update({ is_cover: false }).eq('event_id', selected.id).eq('media_type', 'image')
      if (clear.error) throw clear.error
      const set = await supabase.from('event_media').update({ is_cover: true }).eq('id', item.id)
      if (set.error) throw set.error
      success(ar ? 'تم تعيين الصورة كغلاف للفعالية.' : 'Photo set as event cover.')
      await load()
    } catch (error) { fail(error) }
    finally { setBusy(false) }
  }

  async function removeMedia(item: EventMedia) {
    setBusy(true)
    try {
      const { error } = await supabase.from('event_media').delete().eq('id', item.id)
      if (error) throw error
      success(ar ? 'تم حذف الرابط من الألبوم.' : 'Media link removed from the album.')
      await load()
    } catch (error) { fail(error) }
    finally { setBusy(false) }
  }

  async function deleteEvent() {
    if (!deleteTarget) return
    setBusy(true)
    try {
      const { error } = await supabase.from('events').delete().eq('id', deleteTarget.id)
      if (error) throw error
      success(ar ? 'تم حذف الفعالية وألبومها من المنصة.' : 'Event and its album were deleted from the platform.')
      setDeleteTarget(null)
      await load()
    } catch (error) { fail(error) }
    finally { setBusy(false) }
  }

  return <section className="panel section-gap admin-section admin-events-panel" id="events-admin">
    <div className="admin-events-heading">
      <div><span className="eyebrow">{ar ? 'ذاكرة الكلية' : 'College memories'}</span><h2>{ar ? 'الفعاليات والصور والفيديوهات' : 'Events, photos & videos'}</h2><p>{ar ? 'أضف الفعالية مرة واحدة، ثم اربط صورها وفيديوهاتها من Google Drive أو المصادر المدعومة بدون رفع الملفات على قاعدة البيانات.' : 'Create the event once, then link its photos and videos from Google Drive or supported sources without uploading media to the database.'}</p></div>
      <Icon name="layers" />
    </div>

    <div className="admin-events-grid">
      <form className="admin-event-create" onSubmit={createEvent}>
        <div className="admin-event-card-title"><span>01</span><div><h3>{ar ? 'إضافة فعالية' : 'Add event'}</h3><p>{ar ? 'ابدأ بالمعلومات الأساسية، وبعد الحفظ أضف الألبوم.' : 'Start with the essentials, then add the album.'}</p></div></div>
        <label><span>{ar ? 'اسم الفعالية' : 'Event name'}</span><input name="title" required maxLength={160} placeholder={ar ? 'مثال: اليوم الثقافي 2026' : 'e.g. Cultural Day 2026'} /></label>
        <div className="admin-event-two"><label><span>{ar ? 'التاريخ' : 'Date'}</span><input name="event_date" type="date" required /></label><label><span>{ar ? 'النوع' : 'Type'}</span><select name="event_type" defaultValue="cultural">{types.map((type) => <option key={type.value} value={type.value}>{ar ? type.ar : type.en}</option>)}</select></label></div>
        <label><span>{ar ? 'المكان' : 'Location'}</span><input name="location" placeholder={ar ? 'اختياري' : 'Optional'} /></label>
        <label><span>{ar ? 'وصف قصير' : 'Short description'}</span><textarea name="description" rows={4} placeholder={ar ? 'شنو الحصل في الفعالية؟' : 'What happened at the event?'} /></label>
        <label><span>{ar ? 'رابط مجلد Google Drive الكامل' : 'Full Google Drive folder link'}</span><input name="drive_folder_url" type="url" placeholder="https://drive.google.com/drive/folders/..." /><small>{ar ? 'اختياري؛ يظهر كزر لفتح الألبوم الأصلي. الصور المعروضة داخل المنصة تُضاف كرابط ملف لكل صورة.' : 'Optional; shown as an original-album button. Inline photos are added as individual file links.'}</small></label>
        <div className="admin-event-two"><label><span>{ar ? 'الحالة' : 'Status'}</span><select name="status" defaultValue="published"><option value="published">{ar ? 'منشورة' : 'Published'}</option><option value="draft">{ar ? 'مسودة' : 'Draft'}</option></select></label><label className="admin-event-check"><input name="featured" type="checkbox" /><span>{ar ? 'فعالية مميزة' : 'Featured event'}</span></label></div>
        <button className="button button-primary" type="submit" disabled={busy}>{busy ? (ar ? 'جارٍ الحفظ…' : 'Saving…') : (ar ? 'حفظ الفعالية' : 'Save event')}</button>
      </form>

      <div className="admin-event-media-manager">
        <div className="admin-event-card-title"><span>02</span><div><h3>{ar ? 'إضافة الألبوم' : 'Add album'}</h3><p>{ar ? 'كل رابط في سطر. الأفضل رابط الملف نفسه من Drive، وليس رابط الجروب.' : 'One link per line. Prefer the individual Drive file link, not a group link.'}</p></div></div>
        <label><span>{ar ? 'اختر الفعالية' : 'Choose event'}</span><select value={selectedId} onChange={(event) => setSelectedId(event.target.value)}><option value="">{ar ? 'اختر…' : 'Choose…'}</option>{events.map((event) => <option key={event.id} value={event.id}>{event.title}</option>)}</select></label>

        {selected && <>
          <div className="admin-event-live-row"><div><strong dir="auto">{selected.title}</strong><span>{selected.status === 'published' ? (ar ? 'منشورة' : 'Published') : (ar ? 'مسودة' : 'Draft')} · {selected.featured ? (ar ? 'مميزة' : 'Featured') : (ar ? 'عادية' : 'Standard')}</span></div><div><button type="button" className="text-action" onClick={() => void updateSelected({ featured: !selected.featured })} disabled={busy}>{selected.featured ? (ar ? 'إلغاء التمييز' : 'Unfeature') : (ar ? 'تمييز' : 'Feature')}</button><button type="button" className="text-action" onClick={() => void updateSelected({ status: selected.status === 'published' ? 'draft' : 'published' })} disabled={busy}>{selected.status === 'published' ? (ar ? 'تحويل لمسودة' : 'Make draft') : (ar ? 'نشر' : 'Publish')}</button><button type="button" className="text-action danger-text" onClick={() => setDeleteTarget(selected)} disabled={busy}>{ar ? 'حذف' : 'Delete'}</button></div></div>
          <label><span>{ar ? 'روابط الصور' : 'Photo links'}</span><textarea rows={5} value={imageUrls} onChange={(event) => setImageUrls(event.target.value)} placeholder={ar ? 'رابط Google Drive لكل صورة — رابط في كل سطر' : 'One Google Drive photo link per line'} /></label>
          <label><span>{ar ? 'روابط الفيديوهات' : 'Video links'}</span><textarea rows={4} value={videoUrls} onChange={(event) => setVideoUrls(event.target.value)} placeholder={ar ? 'Google Drive أو YouTube أو Telegram أو WhatsApp — رابط في كل سطر' : 'Google Drive, YouTube, Telegram, or WhatsApp — one link per line'} /></label>
          <label className="admin-event-check admin-event-cover-check"><input type="checkbox" checked={makeFirstCover} onChange={(event) => setMakeFirstCover(event.target.checked)} /><span>{ar ? 'اجعل أول صورة غلاف الفعالية' : 'Use first photo as event cover'}</span></label>
          <button className="button button-primary" type="button" onClick={() => void addMedia()} disabled={busy}>{busy ? (ar ? 'جارٍ الإضافة…' : 'Adding…') : (ar ? 'إضافة الروابط للألبوم' : 'Add links to album')}</button>
        </>}
        {!selected && <div className="admin-event-empty"><Icon name="layers" /><span>{ar ? 'أضف فعالية أولًا أو اختر فعالية موجودة.' : 'Add an event first or choose an existing event.'}</span></div>}
      </div>
    </div>

    {selected && selectedMedia.length > 0 && <div className="admin-event-library">
      <div className="admin-event-library-head"><div><h3>{ar ? 'محتوى الألبوم' : 'Album content'}</h3><span>{ar ? `${selectedImages.length} صورة · ${selectedVideos.length} فيديو` : `${selectedImages.length} photos · ${selectedVideos.length} videos`}</span></div>{selected.drive_folder_url && <a href={selected.drive_folder_url} target="_blank" rel="noopener noreferrer">{ar ? 'فتح مجلد Drive' : 'Open Drive folder'} ↗</a>}</div>
      <div className="admin-event-media-list">{selectedMedia.map((item, index) => <article key={item.id} className="admin-event-media-item">
        <div className="admin-event-media-preview">{item.media_type === 'image' ? <img src={eventImageDisplayUrl(item)} alt="" referrerPolicy="no-referrer" loading="lazy" /> : <Icon name="play" />}</div>
        <div className="admin-event-media-copy"><strong>{item.media_type === 'image' ? (ar ? `صورة ${index + 1}` : `Photo ${index + 1}`) : (ar ? `فيديو ${index + 1}` : `Video ${index + 1}`)}</strong><span>{item.provider === 'google_drive' ? 'Google Drive' : item.provider}</span>{item.is_cover && <em>{ar ? 'الغلاف' : 'Cover'}</em>}</div>
        <div className="admin-event-media-actions"><a href={item.source_url} target="_blank" rel="noopener noreferrer" className="text-action">{ar ? 'فتح' : 'Open'} ↗</a>{item.media_type === 'image' && !item.is_cover && <button type="button" className="text-action" onClick={() => void makeCover(item)} disabled={busy}>{ar ? 'غلاف' : 'Cover'}</button>}<button type="button" className="text-action danger-text" onClick={() => void removeMedia(item)} disabled={busy}>{ar ? 'حذف' : 'Remove'}</button></div>
      </article>)}</div>
    </div>}

    <ConfirmDialog open={Boolean(deleteTarget)} title={ar ? 'حذف الفعالية؟' : 'Delete event?'} description={ar ? 'سيتم حذف الفعالية وكل روابط الصور والفيديوهات التابعة لها من المنصة. الملفات الأصلية في Google Drive لن تُحذف.' : 'The event and all of its media links will be removed from the platform. Original Google Drive files will not be deleted.'} confirmLabel={ar ? 'نعم، حذف الفعالية' : 'Yes, delete event'} cancelLabel={ar ? 'إلغاء' : 'Cancel'} tone="danger" busy={busy} onCancel={() => !busy && setDeleteTarget(null)} onConfirm={() => void deleteEvent()} />
  </section>
}
