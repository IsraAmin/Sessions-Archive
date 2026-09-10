import { useEffect, useMemo, useState, type FormEvent } from 'react'
import { useAuth } from '../hooks/useAuth'
import { useUi } from '../hooks/useUi'
import { errorMessage } from '../lib/errors'
import { eventCoverDisplayUrl, eventImageDisplayUrl, googleDriveFolderEmbedUrl, parseEventImageSource, parseEventVideoSource } from '../lib/eventMedia'
import { publicStorageUrl, supabase } from '../lib/supabase'
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

function imageExtension(file: File) {
  if (file.type === 'image/png') return 'png'
  if (file.type === 'image/webp') return 'webp'
  return 'jpg'
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
  const hasIndividualMedia = Boolean(imageUrls.trim() || videoUrls.trim())

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
      setPane(newCover ? 'cover' : 'details')
      success(ar ? 'تمت إضافة الفعالية. الألبوم اختياري وتقدري تضيفيه في أي وقت.' : 'Event added. The album is optional and can be added at any time.')
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

  async function uploadCover(file: File) {
    if (!selected) return
    const allowed = ['image/jpeg', 'image/png', 'image/webp']
    if (!allowed.includes(file.type)) return fail(new Error(ar ? 'الغلاف لازم يكون JPG أو PNG أو WebP.' : 'Cover must be JPG, PNG, or WebP.'))
    if (file.size > 20 * 1024 * 1024) return fail(new Error(ar ? 'حجم الغلاف لازم يكون 20MB أو أقل.' : 'Cover must be 20MB or smaller.'))

    setBusy(true)
    try {
      const path = `${selected.id}/cover.${imageExtension(file)}`
      const { error: uploadError } = await supabase.storage.from('event-covers').upload(path, file, {
        upsert: true,
        contentType: file.type,
        cacheControl: '3600',
      })
      if (uploadError) throw uploadError
      const publicUrl = publicStorageUrl('event-covers', path)
      if (!publicUrl) throw new Error(ar ? 'تعذر إنشاء رابط الغلاف.' : 'Could not create cover URL.')
      const url = `${publicUrl}?v=${Date.now()}`
      const { error: updateError } = await supabase.from('events').update({
        cover_url: url,
        cover_focus_x: 50,
        cover_focus_y: 50,
        updated_at: new Date().toISOString(),
      }).eq('id', selected.id)
      if (updateError) throw updateError
      setCoverUrl(url)
      setFocusX(50)
      setFocusY(50)
      success(ar ? 'تم رفع الغلاف من جهازك بالجودة الأصلية. تقدري تضبطي موضعه الآن.' : 'Cover uploaded from your device at original quality. You can adjust its position now.')
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
      success(ar ? value ? 'تم ربط مجلد Drive. ما محتاجة تضيفي أي صور أو فيديوهات منفردة.' : 'تم فصل مجلد Drive.' : value ? 'Drive folder connected. Individual photos or videos are not required.' : 'Drive folder disconnected.')
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
    if (!parsedImages.length && !parsedVideos.length) return

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
      success(ar ? `تمت إضافة ${rows.length} عنصر للألبوم.` : `${rows.length} album items added.`)
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

  const coverPreview = eventCoverDisplayUrl(coverUrl || selected?.cover_url)

  return <section className="admin-events-workspace" id="events-admin">
    <div className="admin-events-v2-head">
      <div><span className="eyebrow">{ar ? 'ذاكرة الكلية' : 'College memories'}</span><h2>{ar ? 'إدارة الفعاليات' : 'Events workspace'}</h2><p>{ar ? 'أنشئي الفعالية مرة واحدة، وبعدها عدّلي بياناتها وغلافها وألبومها براحتك. مجلد Drive أو الصور والفيديوهات المنفردة كلها اختيارية.' : 'Create an event once, then freely edit its details, cover, and album. Drive folders and individual media are all optional.'}</p></div>
      <button className="button button-primary" type="button" onClick={() => { setCreating(true); setSelectedId('') }}><span aria-hidden="true">＋</span>{ar ? 'فعالية جديدة' : 'New event'}</button>
    </div>

    <div className="admin-events-v2-layout">
      <aside className="admin-event-browser">
        <div className="admin-event-browser-search"><Icon name="layers" /><input value={search} onChange={(event) => setSearch(event.target.value)} placeholder={ar ? 'ابحث في الفعاليات…' : 'Search events…'} /></div>
        <div className="admin-event-browser-list">
          {filteredEvents.map((item) => <button key={item.id} type="button" className={`admin-event-browser-item ${selectedId === item.id && !creating ? 'active' : ''}`} onClick={() => { setCreating(false); setSelectedId(item.id); setPane('details') }}>
            <span className="admin-event-browser-date"><b>{new Date(`${item.event_date}T12:00:00`).getDate()}</b><small>{new Intl.DateTimeFormat(ar ? 'ar-SA' : 'en-US', { month: 'short' }).format(new Date(`${item.event_date}T12:00:00`))}</small></span>
            <span><strong dir="auto">{item.title}</strong><small>{item.status === 'published' ? (ar ? 'منشورة' : 'Published') : (ar ? 'مسودة' : 'Draft')}</small></span>
          </button>)}
          {!filteredEvents.length && <div className="admin-event-empty"><Icon name="calendar" /><span>{ar ? 'ما في فعاليات هنا.' : 'No events here.'}</span></div>}
        </div>
      </aside>

      <div className="admin-event-editor">
        {creating && <form className="admin-event-v2-form" onSubmit={createEvent}>
          <div className="admin-event-editor-title"><div><span className="eyebrow">{ar ? 'فعالية جديدة' : 'New event'}</span><h3>{ar ? 'أضيفي الأساسيات' : 'Add the essentials'}</h3><p>{ar ? 'الغلاف والألبوم ممكن تضيفيهم بعد الحفظ. ما في أي إلزام بصورة أو فيديو.' : 'Cover and album can be added later. No photo or video is required.'}</p></div></div>
          <label><span>{ar ? 'اسم الفعالية' : 'Event name'}</span><input name="title" required maxLength={160} /></label>
          <div className="admin-event-two"><label><span>{ar ? 'التاريخ' : 'Date'}</span><input name="event_date" type="date" required /></label><label><span>{ar ? 'النوع' : 'Type'}</span><select name="event_type" defaultValue="cultural">{types.map((type) => <option key={type.value} value={type.value}>{ar ? type.ar : type.en}</option>)}</select></label></div>
          <label><span>{ar ? 'المكان' : 'Location'}</span><input name="location" /></label>
          <label><span>{ar ? 'الوصف' : 'Description'}</span><textarea name="description" rows={5} /></label>
          <label><span>{ar ? 'رابط مجلد Drive — اختياري' : 'Drive folder link — optional'}</span><input name="drive_folder_url" type="url" placeholder="https://drive.google.com/drive/folders/..." /><small>{ar ? 'لو أضفتيه، ممكن تكون دي كل الميديا للفعالية وما تحتاجي أي روابط منفردة.' : 'If added, this can be the event’s only media source; individual links are not required.'}</small></label>
          <label><span>{ar ? 'رابط غلاف — اختياري' : 'Cover URL — optional'}</span><input name="cover_url" type="url" /><small>{ar ? 'بعد الحفظ تقدري بدل الرابط ترفعي الغلاف مباشرة من ملفات جهازك.' : 'After saving, you can upload the cover directly from your device instead.'}</small></label>
          <div className="admin-event-two"><label><span>{ar ? 'الحالة' : 'Status'}</span><select name="status" defaultValue="published"><option value="published">{ar ? 'منشورة' : 'Published'}</option><option value="draft">{ar ? 'مسودة' : 'Draft'}</option></select></label><label className="admin-event-check"><input name="featured" type="checkbox" /><span>{ar ? 'فعالية مميزة' : 'Featured event'}</span></label></div>
          <div className="admin-event-form-actions"><button className="button button-primary" disabled={busy}>{ar ? 'حفظ الفعالية' : 'Save event'}</button><button className="button" type="button" onClick={() => setCreating(false)} disabled={busy}>{ar ? 'إلغاء' : 'Cancel'}</button></div>
        </form>}

        {!creating && selected && <>
          <header className="admin-event-editor-header"><div><span>{ar ? 'تعديل فعالية' : 'Edit event'}</span><h3 dir="auto">{selected.title}</h3></div><button className="text-action danger-text" type="button" onClick={() => setDeleteTarget(selected)}>{ar ? 'حذف الفعالية' : 'Delete event'}</button></header>
          <nav className="admin-event-editor-tabs" aria-label={ar ? 'أقسام تعديل الفعالية' : 'Event editing sections'}>
            <button type="button" className={pane === 'details' ? 'active' : ''} onClick={() => setPane('details')}>{ar ? 'البيانات' : 'Details'}</button>
            <button type="button" className={pane === 'cover' ? 'active' : ''} onClick={() => setPane('cover')}>{ar ? 'الغلاف' : 'Cover'}</button>
            <button type="button" className={pane === 'media' ? 'active' : ''} onClick={() => setPane('media')}>{ar ? 'الألبوم' : 'Album'}</button>
          </nav>

          {pane === 'details' && <form className="admin-event-v2-form" key={`details-${selected.id}`} onSubmit={saveDetails}>
            <label><span>{ar ? 'اسم الفعالية' : 'Event name'}</span><input name="title" required maxLength={160} defaultValue={selected.title} /></label>
            <div className="admin-event-two"><label><span>{ar ? 'التاريخ' : 'Date'}</span><input name="event_date" type="date" required defaultValue={selected.event_date} /></label><label><span>{ar ? 'النوع' : 'Type'}</span><select name="event_type" defaultValue={selected.event_type}>{types.map((type) => <option key={type.value} value={type.value}>{ar ? type.ar : type.en}</option>)}</select></label></div>
            <label><span>{ar ? 'المكان' : 'Location'}</span><input name="location" defaultValue={selected.location ?? ''} /></label>
            <label><span>{ar ? 'الوصف' : 'Description'}</span><textarea name="description" rows={6} defaultValue={selected.description} /></label>
            <label><span>{ar ? 'رابط مجلد Google Drive — اختياري' : 'Google Drive folder — optional'}</span><input name="drive_folder_url" type="url" defaultValue={selected.drive_folder_url ?? ''} /><small>{ar ? 'ممكن يكون المجلد هو الألبوم كاملًا بدون إضافة أي صورة أو فيديو منفرد.' : 'The folder can be the complete album without any individual photo or video links.'}</small></label>
            <div className="admin-event-two"><label><span>{ar ? 'الحالة' : 'Status'}</span><select name="status" defaultValue={selected.status}><option value="published">{ar ? 'منشورة' : 'Published'}</option><option value="draft">{ar ? 'مسودة' : 'Draft'}</option></select></label><label className="admin-event-check"><input name="featured" type="checkbox" defaultChecked={selected.featured} /><span>{ar ? 'فعالية مميزة' : 'Featured event'}</span></label></div>
            <button className="button button-primary" disabled={busy}>{ar ? 'حفظ التعديلات' : 'Save changes'}</button>
          </form>}

          {pane === 'cover' && <div className="admin-event-cover-pane">
            <div className="admin-event-cover-preview">{coverPreview ? <img src={coverPreview} alt="" style={{ objectPosition: `${focusX}% ${focusY}%` }} referrerPolicy="no-referrer" /> : <div><Icon name="layers" /><span>{ar ? 'اختاري غلاف للفعالية' : 'Choose an event cover'}</span></div>}</div>
            <div className="event-cover-source-grid">
              <label className="event-cover-upload-control"><span className="event-cover-upload-icon">↑</span><span><strong>{ar ? 'رفع من الجهاز' : 'Upload from device'}</strong><small>{ar ? 'JPG / PNG / WebP حتى 20MB — بدون ضغط للجودة' : 'JPG / PNG / WebP up to 20MB — no quality compression'}</small></span><input type="file" accept="image/jpeg,image/png,image/webp" disabled={busy} onChange={(event) => { const file = event.currentTarget.files?.[0]; if (file) void uploadCover(file); event.currentTarget.value = '' }} /></label>
              <div className="event-cover-or"><span>{ar ? 'أو' : 'OR'}</span></div>
              <label><span>{ar ? 'رابط صورة' : 'Image URL'}</span><input type="url" value={coverUrl} onChange={(event) => setCoverUrl(event.target.value)} placeholder={ar ? 'Google Drive أو رابط صورة عام' : 'Google Drive or public image URL'} /></label>
            </div>
            <div className="admin-event-cover-controls"><label><span>{ar ? 'أفقي' : 'Horizontal'} <b>{focusX}%</b></span><input type="range" min="0" max="100" value={focusX} onChange={(event) => setFocusX(Number(event.target.value))} /></label><label><span>{ar ? 'عمودي' : 'Vertical'} <b>{focusY}%</b></span><input type="range" min="0" max="100" value={focusY} onChange={(event) => setFocusY(Number(event.target.value))} /></label></div>
            <div className="admin-event-cover-actions"><button className="button button-primary" type="button" onClick={() => void saveCover()} disabled={busy}>{ar ? 'حفظ موضع الغلاف' : 'Save cover position'}</button>{selectedImages.length > 0 && <span>{ar ? 'أو اختاري أي صورة من الألبوم كغلاف.' : 'Or choose any album photo as the cover.'}</span>}</div>
          </div>}

          {pane === 'media' && <div className="admin-event-media-pane">
            <section className="admin-event-media-source-card admin-event-drive-source">
              <div><span className="eyebrow">{ar ? 'الخيار الأسرع' : 'Fastest option'}</span><h4>{ar ? 'مجلد Google Drive كامل' : 'Full Google Drive folder'}</h4><p>{ar ? 'الصقي رابط المجلد مرة واحدة. لو ده كفاية ليك، ما مطلوب تضيفي أي صورة أو فيديو تحت.' : 'Paste the folder once. If that is enough, no individual photo or video is required below.'}</p></div>
              <label><span>{ar ? 'رابط المجلد' : 'Folder URL'}</span><input type="url" value={folderUrl} onChange={(event) => setFolderUrl(event.target.value)} placeholder="https://drive.google.com/drive/folders/..." /></label>
              <button className="button button-primary" type="button" onClick={() => void saveDriveFolder()} disabled={busy}>{ar ? 'حفظ رابط المجلد' : 'Save folder link'}</button>
            </section>

            <div className="admin-event-media-divider"><span>{ar ? 'إضافات اختيارية' : 'Optional extras'}</span></div>

            <section className="admin-event-media-source-card">
              <div><h4>{ar ? 'صور أو فيديوهات منفردة' : 'Individual photos or videos'}</h4><p>{ar ? 'إنتِ حرة بالكامل: صور فقط، فيديوهات فقط، الاثنين مع بعض، أو ولا واحد.' : 'Completely flexible: photos only, videos only, both, or neither.'}</p></div>
              <div className="admin-event-two admin-event-media-inputs"><label><span>{ar ? 'روابط صور — اختياري' : 'Photo links — optional'}</span><textarea rows={5} value={imageUrls} onChange={(event) => setImageUrls(event.target.value)} placeholder={ar ? 'كل رابط صورة في سطر براهو' : 'One photo URL per line'} /></label><label><span>{ar ? 'روابط فيديو — اختياري' : 'Video links — optional'}</span><textarea rows={5} value={videoUrls} onChange={(event) => setVideoUrls(event.target.value)} placeholder={ar ? 'كل رابط فيديو في سطر براهو' : 'One video URL per line'} /></label></div>
              <button className="button button-primary" type="button" onClick={() => void addMedia()} disabled={busy || !hasIndividualMedia}>{ar ? 'إضافة الموجود للألبوم' : 'Add entered links'}</button>
              {!hasIndividualMedia && <small className="event-media-optional-note">{ar ? 'ما في روابط منفردة؟ عادي جدًا. لو رابط Drive فوق محفوظ، ما محتاجة تعملي أي خطوة زيادة.' : 'No individual links? That is completely fine. If the Drive folder above is saved, nothing else is required.'}</small>}
            </section>

            {selectedMedia.length > 0 && <section className="admin-event-library">
              <div className="admin-event-library-head"><div><h3>{ar ? 'الميديا المضافة يدويًا' : 'Individually added media'}</h3><span>{ar ? `${selectedImages.length} صورة · ${selectedVideos.length} فيديو` : `${selectedImages.length} photos · ${selectedVideos.length} videos`}</span></div></div>
              <div className="admin-event-media-list">{selectedMedia.map((item, index) => <article key={item.id} className="admin-event-media-item">
                <div className="admin-event-media-preview">{item.media_type === 'image' ? <img src={eventImageDisplayUrl(item)} alt="" referrerPolicy="no-referrer" loading="lazy" /> : <Icon name="play" />}</div>
                <div className="admin-event-media-copy"><strong>{item.media_type === 'image' ? (ar ? `صورة ${index + 1}` : `Photo ${index + 1}`) : (ar ? `فيديو ${index + 1}` : `Video ${index + 1}`)}</strong><span>{item.provider === 'google_drive' ? 'Google Drive' : item.provider}</span>{item.is_cover && <em>{ar ? 'الغلاف' : 'Cover'}</em>}</div>
                <div className="admin-event-media-actions"><a href={item.source_url} target="_blank" rel="noopener noreferrer" className="text-action">{ar ? 'فتح' : 'Open'} ↗</a>{item.media_type === 'image' && <button type="button" className="text-action" onClick={() => void useAsCover(item)} disabled={busy}>{ar ? 'استخدام كغلاف' : 'Use as cover'}</button>}<button type="button" className="text-action danger-text" onClick={() => void removeMedia(item)} disabled={busy}>{ar ? 'حذف' : 'Remove'}</button></div>
              </article>)}</div>
            </section>}
          </div>}
        </>}

        {!creating && !selected && <div className="admin-event-editor-empty"><Icon name="layers" /><strong>{ar ? 'اختاري فعالية أو أضيفي واحدة جديدة' : 'Choose an event or add a new one'}</strong><span>{ar ? 'بعد الحفظ تقدري تضيفي الغلاف والألبوم في أي وقت.' : 'After saving, cover and album can be added at any time.'}</span></div>}
      </div>
    </div>

    <ConfirmDialog open={Boolean(deleteTarget)} title={ar ? 'حذف الفعالية؟' : 'Delete event?'} description={ar ? 'سيتم حذف الفعالية وروابط الميديا التابعة لها من المنصة. ملفات Google Drive الأصلية لن تُحذف.' : 'The event and its media links will be removed from the platform. Original Google Drive files will not be deleted.'} confirmLabel={ar ? 'نعم، حذف الفعالية' : 'Yes, delete event'} cancelLabel={ar ? 'إلغاء' : 'Cancel'} tone="danger" busy={busy} onCancel={() => !busy && setDeleteTarget(null)} onConfirm={() => void deleteEvent()} />
  </section>
}
