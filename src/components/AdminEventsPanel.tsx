import { useEffect, useMemo, useState, type FormEvent } from 'react'
import { useAuth } from '../hooks/useAuth'
import { useUi } from '../hooks/useUi'
import { errorMessage } from '../lib/errors'
import { eventCoverDisplayUrl, eventImageDisplayUrl, googleDriveFolderEmbedUrl, parseEventImageSource, parseEventVideoSource } from '../lib/eventMedia'
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

type EventEditorPane = 'details' | 'cover' | 'media'

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
  const [creating, setCreating] = useState(false)
  const [pane, setPane] = useState<EventEditorPane>('details')
  const [search, setSearch] = useState('')
  const [imageUrls, setImageUrls] = useState('')
  const [videoUrls, setVideoUrls] = useState('')
  const [folderUrl, setFolderUrl] = useState('')
  const [coverUrl, setCoverUrl] = useState('')
  const [focusX, setFocusX] = useState(50)
  const [focusY, setFocusY] = useState(50)
  const [busy, setBusy] = useState(false)
  const [deleteTarget, setDeleteTarget] = useState<CollegeEvent | null>(null)

  function success(message: string) { showToast({ kind: 'success', title: ar ? 'تم بنجاح' : 'Success', message }) }
  function fail(error: unknown) { showToast({ kind: 'error', title: ar ? 'تعذر التنفيذ' : 'Could not complete action', message: errorMessage(error) }) }

  async function load(preferredId?: string) {
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
      setSelectedId((current) => {
        if (preferredId && nextEvents.some((item) => item.id === preferredId)) return preferredId
        if (current && nextEvents.some((item) => item.id === current)) return current
        return nextEvents[0]?.id ?? ''
      })
    } catch (error) { fail(error) }
  }

  useEffect(() => { void load() }, [])

  const selected = events.find((event) => event.id === selectedId) ?? null
  const selectedMedia = useMemo(() => media.filter((item) => item.event_id === selectedId), [media, selectedId])
  const selectedImages = selectedMedia.filter((item) => item.media_type === 'image')
  const selectedVideos = selectedMedia.filter((item) => item.media_type === 'video')
  const filteredEvents = useMemo(() => {
    const needle = search.trim().toLowerCase()
    if (!needle) return events
    return events.filter((item) => [item.title, item.location ?? '', item.event_type].join(' ').toLowerCase().includes(needle))
  }, [events, search])

  useEffect(() => {
    if (!selected) {
      setFolderUrl('')
      setCoverUrl('')
      setFocusX(50)
      setFocusY(50)
      return
    }
    setFolderUrl(selected.drive_folder_url ?? '')
    setCoverUrl(selected.cover_url ?? '')
    setFocusX(selected.cover_focus_x ?? 50)
    setFocusY(selected.cover_focus_y ?? 50)
  }, [selected?.id, selected?.drive_folder_url, selected?.cover_url, selected?.cover_focus_x, selected?.cover_focus_y])

  async function createEvent(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    const form = event.currentTarget
    const values = new FormData(form)
    const title = String(values.get('title') || '').trim()
    const eventDate = String(values.get('event_date') || '')
    const description = String(values.get('description') || '').trim()
    const newCover = String(values.get('cover_url') || '').trim()
    const newFolder = String(values.get('drive_folder_url') || '').trim()
    if (title.length < 2 || !eventDate) return fail(new Error(ar ? 'اكتب اسم الفعالية وتاريخها.' : 'Add the event name and date.'))
    if (newCover && !parseEventImageSource(newCover)) return fail(new Error(ar ? 'رابط الغلاف غير صالح.' : 'The cover link is not valid.'))
    if (newFolder && !googleDriveFolderEmbedUrl(newFolder)) return fail(new Error(ar ? 'رابط مجلد Google Drive غير صالح.' : 'The Google Drive folder link is not valid.'))

    setBusy(true)
    try {
      const payload = {
        title,
        slug: slugify(String(values.get('slug') || title)),
        description,
        event_type: String(values.get('event_type') || 'other') as EventType,
        event_date: eventDate,
        location: String(values.get('location') || '').trim() || null,
        drive_folder_url: newFolder || null,
        cover_url: newCover || null,
        cover_focus_x: 50,
        cover_focus_y: 50,
        featured: values.get('featured') === 'on',
        status: String(values.get('status') || 'published') as EventStatus,
        created_by: user?.id ?? null,
      }
      const { data, error } = await supabase.from('events').insert(payload).select('*').single()
      if (error) throw error
      form.reset()
      setCreating(false)
      setPane('details')
      success(ar ? 'تمت إضافة الفعالية. تقدري تعدليها وتضيفي ألبومها الآن.' : 'Event added. You can edit it and build its album now.')
      await load(data?.id)
    } catch (error) { fail(error) }
    finally { setBusy(false) }
  }

  async function saveDetails(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    if (!selected) return
    const values = new FormData(event.currentTarget)
    const title = String(values.get('title') || '').trim()
    const eventDate = String(values.get('event_date') || '')
    const nextFolder = String(values.get('drive_folder_url') || '').trim()
    if (title.length < 2 || !eventDate) return fail(new Error(ar ? 'اسم الفعالية والتاريخ مطلوبان.' : 'Event name and date are required.'))
    if (nextFolder && !googleDriveFolderEmbedUrl(nextFolder)) return fail(new Error(ar ? 'رابط مجلد Google Drive غير صالح.' : 'The Google Drive folder link is not valid.'))

    setBusy(true)
    try {
      const patch = {
        title,
        slug: slugify(String(values.get('slug') || selected.slug || title)),
        description: String(values.get('description') || '').trim(),
        event_type: String(values.get('event_type') || selected.event_type) as EventType,
        event_date: eventDate,
        location: String(values.get('location') || '').trim() || null,
        drive_folder_url: nextFolder || null,
        featured: values.get('featured') === 'on',
        status: String(values.get('status') || selected.status) as EventStatus,
        updated_at: new Date().toISOString(),
      }
      const { error } = await supabase.from('events').update(patch).eq('id', selected.id)
      if (error) throw error
      success(ar ? 'تم حفظ تعديلات الفعالية.' : 'Event changes saved.')
      await load(selected.id)
    } catch (error) { fail(error) }
    finally { setBusy(false) }
  }

  async function saveCover() {
    if (!selected) return
    const nextCover = coverUrl.trim()
    if (nextCover && !parseEventImageSource(nextCover)) return fail(new Error(ar ? 'استخدمي رابط صورة عام أو رابط ملف صورة من Google Drive.' : 'Use a public image URL or a Google Drive image file link.'))
    setBusy(true)
    try {
      const { error } = await supabase.from('events').update({
        cover_url: nextCover || null,
        cover_focus_x: focusX,
        cover_focus_y: focusY,
        updated_at: new Date().toISOString(),
      }).eq('id', selected.id)
      if (error) throw error
      success(ar ? 'تم حفظ غلاف الفعالية وموضعه.' : 'Event cover and focal point saved.')
      await load(selected.id)
    } catch (error) { fail(error) }
    finally { setBusy(false) }
  }

  async function saveDriveFolder() {
    if (!selected) return
    const value = folderUrl.trim()
    if (value && !googleDriveFolderEmbedUrl(value)) return fail(new Error(ar ? 'الصق رابط مجلد Google Drive كامل.' : 'Paste a full Google Drive folder link.'))
    setBusy(true)
    try {
      const { error } = await supabase.from('events').update({ drive_folder_url: value || null, updated_at: new Date().toISOString() }).eq('id', selected.id)
      if (error) throw error
      success(ar ? value ? 'تم ربط مجلد Drive. الألبوم سيُعرض منه مباشرة.' : 'تم فصل مجلد Drive.' : value ? 'Drive folder connected. The album will display directly from it.' : 'Drive folder disconnected.')
      await load(selected.id)
    } catch (error) { fail(error) }
    finally { setBusy(false) }
  }

  async function addMedia() {
    if (!selected) return
    const imageSources = lines(imageUrls).map(parseEventImageSource)
    const videoSources = lines(videoUrls).map(parseEventVideoSource)
    if (imageSources.some((item) => !item) || videoSources.some((item) => !item)) return fail(new Error(ar ? 'في رابط غير صالح. خلي كل رابط في سطر براهو.' : 'One or more links are invalid. Keep one link per line.'))

    const parsedImages = imageSources.filter((item): item is NonNullable<typeof item> => Boolean(item))
    const parsedVideos = videoSources.filter((item): item is NonNullable<typeof item> => Boolean(item))
    if (!parsedImages.length && !parsedVideos.length) return fail(new Error(ar ? 'أضف رابط صورة أو فيديو واحد على الأقل.' : 'Add at least one photo or video link.'))

    setBusy(true)
    try {
      const start = selectedMedia.reduce((max, item) => Math.max(max, item.position), 0) + 1
      const rows = [
        ...parsedImages.map((item, index) => ({ event_id: selected.id, media_type: 'image' as const, provider: item.provider, source_url: item.sourceUrl, source_id: item.sourceId, title: null, caption: null, position: start + index, is_cover: false })),
        ...parsedVideos.map((item, index) => ({ event_id: selected.id, media_type: 'video' as const, provider: item.provider, source_url: item.sourceUrl, source_id: item.sourceId, title: null, caption: null, position: start + parsedImages.length + index, is_cover: false })),
      ]
      const { error } = await supabase.from('event_media').insert(rows)
      if (error) throw error
      setImageUrls('')
      setVideoUrls('')
      success(ar ? `تمت إضافة ${rows.length} ملف للألبوم.` : `${rows.length} media items added.`)
      await load(selected.id)
    } catch (error) { fail(error) }
    finally { setBusy(false) }
  }

  async function useAsCover(item: EventMedia) {
    if (!selected || item.media_type !== 'image') return
    setBusy(true)
    try {
      const clear = await supabase.from('event_media').update({ is_cover: false }).eq('event_id', selected.id).eq('media_type', 'image')
      if (clear.error) throw clear.error
      const mark = await supabase.from('event_media').update({ is_cover: true }).eq('id', item.id)
      if (mark.error) throw mark.error
      const update = await supabase.from('events').update({ cover_url: item.source_url, cover_focus_x: 50, cover_focus_y: 50, updated_at: new Date().toISOString() }).eq('id', selected.id)
      if (update.error) throw update.error
      setCoverUrl(item.source_url)
      setFocusX(50)
      setFocusY(50)
      success(ar ? 'تم اختيار الصورة كغلاف. تقدري تضبطي موضعها من تبويب الغلاف.' : 'Photo selected as cover. You can adjust its focal point in the Cover tab.')
      await load(selected.id)
      setPane('cover')
    } catch (error) { fail(error) }
    finally { setBusy(false) }
  }

  async function removeMedia(item: EventMedia) {
    setBusy(true)
    try {
      const { error } = await supabase.from('event_media').delete().eq('id', item.id)
      if (error) throw error
      success(ar ? 'تم حذف الرابط من الألبوم.' : 'Media link removed from the album.')
      await load(selected?.id)
    } catch (error) { fail(error) }
    finally { setBusy(false) }
  }

  async function deleteEvent() {
    if (!deleteTarget) return
    setBusy(true)
    try {
      const { error } = await supabase.from('events').delete().eq('id', deleteTarget.id)
      if (error) throw error
      success(ar ? 'تم حذف الفعالية وروابط ألبومها من المنصة.' : 'Event and its album links were removed from the platform.')
      setDeleteTarget(null)
      setCreating(false)
      await load()
    } catch (error) { fail(error) }
    finally { setBusy(false) }
  }

  const liveFolder = folderUrl.trim() ? googleDriveFolderEmbedUrl(folderUrl) : null
  const liveCover = eventCoverDisplayUrl(coverUrl.trim())

  return <section className="admin-events-workspace" id="events-admin">
    <header className="admin-events-v2-head">
      <div><span className="eyebrow">{ar ? 'ذاكرة الكلية' : 'College memories'}</span><h2>{ar ? 'إدارة الفعاليات' : 'Events workspace'}</h2><p>{ar ? 'أنشئ الفعالية، عدّل بياناتها، اختر غلافها، ثم اربط مجلد Drive أو أضف صورًا وفيديوهات مختارة.' : 'Create an event, edit its details, choose its cover, then connect a Drive folder or add selected photos and videos.'}</p></div>
      <button type="button" className="button button-primary" onClick={() => { setCreating(true); setSelectedId(''); setPane('details') }}><span aria-hidden="true">＋</span>{ar ? 'فعالية جديدة' : 'New event'}</button>
    </header>

    <div className="admin-events-v2-layout">
      <aside className="admin-event-browser">
        <div className="admin-event-browser-search"><Icon name="layers" /><input value={search} onChange={(event) => setSearch(event.target.value)} placeholder={ar ? 'ابحث في الفعاليات…' : 'Search events…'} /></div>
        <div className="admin-event-browser-list">
          {filteredEvents.map((item) => {
            const itemMedia = media.filter((mediaItem) => mediaItem.event_id === item.id)
            const image = eventCoverDisplayUrl(item.cover_url) ?? (itemMedia.find((mediaItem) => mediaItem.is_cover && mediaItem.media_type === 'image') ? eventImageDisplayUrl(itemMedia.find((mediaItem) => mediaItem.is_cover && mediaItem.media_type === 'image') as EventMedia) : null)
            return <button key={item.id} type="button" className={`admin-event-browser-item ${selectedId === item.id && !creating ? 'active' : ''}`} onClick={() => { setCreating(false); setSelectedId(item.id); setPane('details') }}>
              <span className="admin-event-browser-thumb">{image ? <img src={image} alt="" referrerPolicy="no-referrer" /> : <Icon name="calendar" />}</span>
              <span><strong dir="auto">{item.title}</strong><small>{item.event_date} · {item.status === 'published' ? (ar ? 'منشورة' : 'Published') : (ar ? 'مسودة' : 'Draft')}</small></span>
              {item.featured && <em>★</em>}
            </button>
          })}
          {!filteredEvents.length && <div className="admin-event-browser-empty">{ar ? 'ما في فعاليات هنا لسه.' : 'No events here yet.'}</div>}
        </div>
      </aside>

      <main className="admin-event-editor">
        {creating ? <section className="admin-event-create-v2">
          <div className="admin-event-editor-title"><div><span>{ar ? 'فعالية جديدة' : 'New event'}</span><h3>{ar ? 'ابدأ من الأساسيات' : 'Start with the essentials'}</h3></div><button type="button" className="text-action" onClick={() => { setCreating(false); setSelectedId(events[0]?.id ?? '') }}>{ar ? 'إلغاء' : 'Cancel'}</button></div>
          <form className="admin-event-form-v2" onSubmit={createEvent}>
            <label className="wide"><span>{ar ? 'اسم الفعالية' : 'Event name'}</span><input name="title" required maxLength={160} placeholder={ar ? 'مثال: اليوم الثقافي 2026' : 'e.g. Cultural Day 2026'} /></label>
            <label><span>{ar ? 'التاريخ' : 'Date'}</span><input name="event_date" type="date" required /></label>
            <label><span>{ar ? 'النوع' : 'Type'}</span><select name="event_type" defaultValue="cultural">{types.map((type) => <option key={type.value} value={type.value}>{ar ? type.ar : type.en}</option>)}</select></label>
            <label className="wide"><span>{ar ? 'المكان' : 'Location'}</span><input name="location" /></label>
            <label className="wide"><span>{ar ? 'الوصف' : 'Description'}</span><textarea name="description" rows={5} /></label>
            <label className="wide"><span>{ar ? 'رابط غلاف مبدئي' : 'Initial cover link'}</span><input name="cover_url" type="url" placeholder={ar ? 'رابط صورة من Drive أو رابط صورة عام — اختياري' : 'Drive image link or public image URL — optional'} /></label>
            <label className="wide"><span>{ar ? 'مجلد Google Drive' : 'Google Drive folder'}</span><input name="drive_folder_url" type="url" placeholder="https://drive.google.com/drive/folders/..." /><small>{ar ? 'لو المجلد عام، محتواه سيظهر مباشرة داخل صفحة الفعالية.' : 'If the folder is public, its contents will display directly inside the event page.'}</small></label>
            <label><span>{ar ? 'الحالة' : 'Status'}</span><select name="status" defaultValue="published"><option value="published">{ar ? 'منشورة' : 'Published'}</option><option value="draft">{ar ? 'مسودة' : 'Draft'}</option></select></label>
            <label className="admin-event-check"><input name="featured" type="checkbox" /><span>{ar ? 'فعالية مميزة' : 'Featured event'}</span></label>
            <button className="button button-primary wide" disabled={busy}>{busy ? (ar ? 'جارٍ الحفظ…' : 'Saving…') : (ar ? 'إنشاء الفعالية' : 'Create event')}</button>
          </form>
        </section> : selected ? <>
          <div className="admin-event-editor-title">
            <div><span>{selected.status === 'published' ? (ar ? 'منشورة' : 'Published') : (ar ? 'مسودة' : 'Draft')}</span><h3 dir="auto">{selected.title}</h3></div>
            <button type="button" className="text-action danger-text" onClick={() => setDeleteTarget(selected)}>{ar ? 'حذف الفعالية' : 'Delete event'}</button>
          </div>

          <nav className="admin-event-editor-tabs" aria-label={ar ? 'أقسام تعديل الفعالية' : 'Event editor sections'}>
            <button type="button" className={pane === 'details' ? 'active' : ''} onClick={() => setPane('details')}>{ar ? 'البيانات' : 'Details'}</button>
            <button type="button" className={pane === 'cover' ? 'active' : ''} onClick={() => setPane('cover')}>{ar ? 'الغلاف' : 'Cover'}</button>
            <button type="button" className={pane === 'media' ? 'active' : ''} onClick={() => setPane('media')}>{ar ? 'الألبوم' : 'Album'} <span>{selectedMedia.length || ''}</span></button>
          </nav>

          {pane === 'details' && <form key={`details-${selected.id}`} className="admin-event-form-v2" onSubmit={saveDetails}>
            <label className="wide"><span>{ar ? 'اسم الفعالية' : 'Event name'}</span><input name="title" required maxLength={160} defaultValue={selected.title} /></label>
            <label><span>{ar ? 'التاريخ' : 'Date'}</span><input name="event_date" type="date" required defaultValue={selected.event_date} /></label>
            <label><span>{ar ? 'النوع' : 'Type'}</span><select name="event_type" defaultValue={selected.event_type}>{types.map((type) => <option key={type.value} value={type.value}>{ar ? type.ar : type.en}</option>)}</select></label>
            <label className="wide"><span>{ar ? 'المكان' : 'Location'}</span><input name="location" defaultValue={selected.location ?? ''} /></label>
            <label className="wide"><span>{ar ? 'الوصف' : 'Description'}</span><textarea name="description" rows={6} defaultValue={selected.description} /></label>
            <label className="wide"><span>{ar ? 'رابط مجلد Drive' : 'Drive folder link'}</span><input name="drive_folder_url" type="url" defaultValue={selected.drive_folder_url ?? ''} /><small>{ar ? 'تقدري تعدليه هنا أو من تبويب الألبوم.' : 'You can also change this from the Album tab.'}</small></label>
            <label><span>{ar ? 'الحالة' : 'Status'}</span><select name="status" defaultValue={selected.status}><option value="published">{ar ? 'منشورة' : 'Published'}</option><option value="draft">{ar ? 'مسودة' : 'Draft'}</option></select></label>
            <label className="admin-event-check"><input name="featured" type="checkbox" defaultChecked={selected.featured} /><span>{ar ? 'فعالية مميزة' : 'Featured event'}</span></label>
            <label className="wide admin-event-slug"><span>Slug</span><input name="slug" defaultValue={selected.slug} /><small>{ar ? 'اتركيه كما هو إلا لو عندك سبب لتغييره.' : 'Leave this unchanged unless you need a different URL slug.'}</small></label>
            <button className="button button-primary wide" disabled={busy}>{busy ? (ar ? 'جارٍ الحفظ…' : 'Saving…') : (ar ? 'حفظ التعديلات' : 'Save changes')}</button>
          </form>}

          {pane === 'cover' && <section className="admin-event-cover-studio">
            <div className="admin-event-cover-preview">
              {liveCover ? <img src={liveCover} alt="" referrerPolicy="no-referrer" style={{ objectPosition: `${focusX}% ${focusY}%` }} /> : <div><Icon name="layers" /><span>{ar ? 'أضف رابط غلاف أو اختر صورة من الألبوم' : 'Add a cover link or choose an album photo'}</span></div>}
              <span className="admin-event-cover-preview-label">{ar ? 'معاينة الغلاف' : 'Cover preview'}</span>
            </div>
            <label><span>{ar ? 'رابط صورة الغلاف' : 'Cover image link'}</span><input value={coverUrl} onChange={(event) => setCoverUrl(event.target.value)} placeholder={ar ? 'Google Drive أو رابط صورة عام' : 'Google Drive or public image URL'} /></label>
            <div className="admin-event-focus-grid">
              <label><span>{ar ? 'أفقي' : 'Horizontal'} <b>{focusX}%</b></span><input type="range" min="0" max="100" value={focusX} onChange={(event) => setFocusX(Number(event.target.value))} /></label>
              <label><span>{ar ? 'عمودي' : 'Vertical'} <b>{focusY}%</b></span><input type="range" min="0" max="100" value={focusY} onChange={(event) => setFocusY(Number(event.target.value))} /></label>
            </div>
            <div className="admin-event-cover-actions"><button type="button" className="button button-primary" onClick={() => void saveCover()} disabled={busy}>{ar ? 'حفظ الغلاف' : 'Save cover'}</button>{coverUrl && <button type="button" className="button button-ghost" onClick={() => { setCoverUrl(''); setFocusX(50); setFocusY(50) }}>{ar ? 'إزالة الغلاف' : 'Remove cover'}</button>}</div>
            {selectedImages.length > 0 && <div className="admin-event-cover-picker"><div><strong>{ar ? 'أو اختاري من الصور المضافة' : 'Or choose from added photos'}</strong><span>{ar ? 'وبعدها عدّلي موضع الصورة فوق.' : 'Then fine-tune the focal point above.'}</span></div><div>{selectedImages.map((item) => <button key={item.id} type="button" onClick={() => void useAsCover(item)} className={selected.cover_url === item.source_url || item.is_cover ? 'active' : ''}><img src={eventImageDisplayUrl(item)} alt="" referrerPolicy="no-referrer" /></button>)}</div></div>}
          </section>}

          {pane === 'media' && <section className="admin-event-album-studio">
            <div className="admin-event-source-card primary-source">
              <div className="admin-event-source-title"><span>01</span><div><h4>{ar ? 'مجلد Drive واحد' : 'One Drive folder'}</h4><p>{ar ? 'الصقي رابط المجلد مرة واحدة. المنصة تعرضه Live، وأي صور جديدة في المجلد تظل ضمن نفس الألبوم.' : 'Paste the folder once. The platform displays it live, and new files remain part of the same album.'}</p></div></div>
              <div className="admin-event-folder-row"><input value={folderUrl} onChange={(event) => setFolderUrl(event.target.value)} placeholder="https://drive.google.com/drive/folders/..." /><button type="button" className="button button-primary" onClick={() => void saveDriveFolder()} disabled={busy}>{ar ? 'ربط المجلد' : 'Connect folder'}</button></div>
              {folderUrl && !liveFolder && <p className="notice error">{ar ? 'الرابط الحالي ليس رابط مجلد Google Drive صالح.' : 'This is not a valid Google Drive folder link.'}</p>}
              {liveFolder && <div className="admin-event-folder-preview"><iframe src={liveFolder} title={ar ? 'معاينة مجلد Drive' : 'Drive folder preview'} loading="lazy" /></div>}
            </div>

            <div className="admin-event-source-card">
              <div className="admin-event-source-title"><span>02</span><div><h4>{ar ? 'مختارات بترتيبك' : 'Curated picks'}</h4><p>{ar ? 'لو عايزة صور محددة تظهر في الـGallery المخصص أو فيديوهات داخل الصفحة، أضيفي كل رابط في سطر.' : 'For a custom gallery or in-page videos, add one link per line.'}</p></div></div>
              <label><span>{ar ? 'روابط الصور' : 'Photo links'}</span><textarea rows={5} value={imageUrls} onChange={(event) => setImageUrls(event.target.value)} placeholder={ar ? 'رابط لكل صورة — كل رابط في سطر' : 'One photo link per line'} /></label>
              <label><span>{ar ? 'روابط الفيديوهات' : 'Video links'}</span><textarea rows={4} value={videoUrls} onChange={(event) => setVideoUrls(event.target.value)} placeholder={ar ? 'Drive أو YouTube أو Telegram أو WhatsApp — كل رابط في سطر' : 'Drive, YouTube, Telegram, or WhatsApp — one link per line'} /></label>
              <button className="button button-primary" type="button" onClick={() => void addMedia()} disabled={busy}>{ar ? 'إضافة للألبوم' : 'Add to album'}</button>
            </div>

            {selectedMedia.length > 0 && <div className="admin-event-library-v2">
              <div className="admin-event-library-head"><div><h4>{ar ? 'المحتوى المضاف يدويًا' : 'Curated media'}</h4><span>{ar ? `${selectedImages.length} صورة · ${selectedVideos.length} فيديو` : `${selectedImages.length} photos · ${selectedVideos.length} videos`}</span></div></div>
              <div className="admin-event-media-list-v2">{selectedMedia.map((item, index) => <article key={item.id} className="admin-event-media-row-v2">
                <div className="admin-event-media-preview-v2">{item.media_type === 'image' ? <img src={eventImageDisplayUrl(item)} alt="" referrerPolicy="no-referrer" loading="lazy" /> : <Icon name="play" />}</div>
                <div><strong>{item.media_type === 'image' ? (ar ? `صورة ${index + 1}` : `Photo ${index + 1}`) : (ar ? `فيديو ${index + 1}` : `Video ${index + 1}`)}</strong><span>{item.provider === 'google_drive' ? 'Google Drive' : item.provider}</span></div>
                <div><a href={item.source_url} target="_blank" rel="noopener noreferrer" className="text-action">{ar ? 'فتح' : 'Open'} ↗</a>{item.media_type === 'image' && <button type="button" className="text-action" onClick={() => void useAsCover(item)} disabled={busy}>{ar ? 'اجعليها الغلاف' : 'Use as cover'}</button>}<button type="button" className="text-action danger-text" onClick={() => void removeMedia(item)} disabled={busy}>{ar ? 'حذف' : 'Remove'}</button></div>
              </article>)}</div>
            </div>}
          </section>}
        </> : <div className="admin-event-editor-empty"><Icon name="layers" /><strong>{ar ? 'اختاري فعالية أو أنشئي واحدة جديدة' : 'Choose an event or create a new one'}</strong><span>{ar ? 'كل التعديل والغلاف والألبوم هيظهر هنا.' : 'Details, cover, and album controls will appear here.'}</span></div>}
      </main>
    </div>

    <ConfirmDialog open={Boolean(deleteTarget)} title={ar ? 'حذف الفعالية؟' : 'Delete event?'} description={ar ? 'سيتم حذف الفعالية وكل روابط الصور والفيديوهات التابعة لها من المنصة. الملفات الأصلية في Google Drive لن تُحذف.' : 'The event and its media links will be removed from the platform. Original Google Drive files will not be deleted.'} confirmLabel={ar ? 'نعم، حذف الفعالية' : 'Yes, delete event'} cancelLabel={ar ? 'إلغاء' : 'Cancel'} tone="danger" busy={busy} onCancel={() => !busy && setDeleteTarget(null)} onConfirm={() => void deleteEvent()} />
  </section>
}
