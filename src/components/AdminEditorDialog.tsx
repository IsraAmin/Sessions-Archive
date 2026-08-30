import { useState, type FormEvent, type ReactNode } from 'react'
import type { Category, Session, SessionSeries, SessionVideo, Speaker } from '../types/domain'
import { parseVideoSource, videoSourceUrl } from '../lib/videoSource'
import { Icon } from './Icon'

type EditTarget =
  | { type: 'category'; item: Category }
  | { type: 'speaker'; item: Speaker }
  | { type: 'series'; item: SessionSeries }
  | { type: 'session'; item: Session }
  | { type: 'video'; item: SessionVideo }

type Props = {
  target: EditTarget | null
  categories: Category[]
  speakers: Speaker[]
  series: SessionSeries[]
  sessions: Session[]
  language: 'ar' | 'en'
  busy?: boolean
  onClose: () => void
  onSave: (target: EditTarget, values: Record<string, unknown>) => Promise<void>
}

function dateTimeLocal(value: string | null) {
  if (!value) return ''
  const date = new Date(value)
  const offset = date.getTimezoneOffset() * 60_000
  return new Date(date.getTime() - offset).toISOString().slice(0, 16)
}

function Field({ label, children, wide = false, hint }: { label: string; children: ReactNode; wide?: boolean; hint?: string }) {
  return <label className={`form-field ${wide ? 'wide' : ''}`}><span className="field-label">{label}</span>{children}{hint && <span className="field-hint">{hint}</span>}</label>
}

export type { EditTarget }

export function AdminEditorDialog({ target, categories, speakers, series, sessions, language, busy = false, onClose, onSave }: Props) {
  const [localError, setLocalError] = useState('')
  if (!target) return null
  const activeTarget: EditTarget = target
  const ar = language === 'ar'
  const title = activeTarget.type === 'category' ? (ar ? 'تعديل التصنيف' : 'Edit category') : activeTarget.type === 'speaker' ? (ar ? 'تعديل المتحدث' : 'Edit speaker') : activeTarget.type === 'series' ? (ar ? 'تعديل السلسلة' : 'Edit series') : activeTarget.type === 'session' ? (ar ? 'تعديل السيشن' : 'Edit session') : (ar ? 'تعديل التسجيل' : 'Edit recording')
  const selectedSpeakerIds = activeTarget.type === 'session'
    ? new Set(activeTarget.item.speaker_ids?.length ? activeTarget.item.speaker_ids : activeTarget.item.speaker_id ? [activeTarget.item.speaker_id] : [])
    : new Set<string>()

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault(); setLocalError('')
    const form = new FormData(event.currentTarget)
    try {
      switch (activeTarget.type) {
        case 'category':
          await onSave(activeTarget, { name: String(form.get('name') || '').trim(), slug: String(form.get('slug') || '').trim(), description: String(form.get('description') || '').trim() || null })
          break
        case 'speaker':
          await onSave(activeTarget, { name: String(form.get('name') || '').trim(), organization: String(form.get('organization') || '').trim() || null, bio: String(form.get('bio') || '').trim() || null })
          break
        case 'series':
          await onSave(activeTarget, { title: String(form.get('title') || '').trim(), description: String(form.get('description') || '').trim() || null, published: form.get('published') === 'true' })
          break
        case 'session': {
          const startsAt = String(form.get('starts_at') || '')
          const endsAt = String(form.get('ends_at') || '')
          const seriesId = String(form.get('series_id') || '') || null
          const speakerIds = form.getAll('speaker_ids').map(value => String(value)).filter(Boolean)
          await onSave(activeTarget, { title: String(form.get('title') || '').trim(), slug: String(form.get('slug') || '').trim(), description: String(form.get('description') || '').trim(), starts_at: startsAt ? new Date(startsAt).toISOString() : activeTarget.item.starts_at, ends_at: endsAt ? new Date(endsAt).toISOString() : null, location: String(form.get('location') || '').trim() || null, capacity: Math.max(1, Number(form.get('capacity') || 1)), category_id: String(form.get('category_id') || '') || null, speaker_id: speakerIds[0] ?? null, speaker_ids: speakerIds, series_id: seriesId, series_position: seriesId ? Math.max(1, Number(form.get('series_position') || 1)) : null, status: String(form.get('status') || 'published') })
          break
        }
        case 'video': {
          const url = String(form.get('video_url') || '').trim()
          const source = parseVideoSource(url)
          if (!source) throw new Error(ar ? 'أدخلي رابط YouTube أو Google Drive صالحًا.' : 'Enter a valid YouTube or Google Drive URL.')
          await onSave(activeTarget, {
            title: String(form.get('title') || '').trim(),
            session_id: String(form.get('session_id') || ''),
            youtube_video_id: source.id,
            video_provider: source.provider,
            part_number: Math.max(1, Math.floor(Number(form.get('part_number') || 1))),
            position: Math.max(0, Math.floor(Number(form.get('position') || 0))),
          })
          break
        }
      }
    } catch (error) { setLocalError(error instanceof Error ? error.message : String(error)) }
  }

  return <div className="editor-backdrop" role="presentation" onMouseDown={(event) => { if (event.currentTarget === event.target && !busy) onClose() }}>
    <section className="admin-editor" role="dialog" aria-modal="true" aria-labelledby="admin-editor-title">
      <header className="editor-head"><div><div className="eyebrow">{ar ? 'تحرير المحتوى' : 'Content editor'}</div><h2 id="admin-editor-title">{title}</h2><p>{ar ? 'عدّلي كل البيانات ثم احفظي التغييرات.' : 'Update any field, then save your changes.'}</p></div><button type="button" className="editor-close" onClick={onClose} disabled={busy} aria-label={ar ? 'إغلاق' : 'Close'}><Icon name="close" /></button></header>
      <form onSubmit={(event) => void submit(event)}><div className="editor-body">
        {activeTarget.type === 'category' && <section className="editor-section"><h3>{ar ? 'بيانات التصنيف' : 'Category details'}</h3><div className="editor-grid"><Field label={ar ? 'اسم التصنيف' : 'Category name'}><input name="name" defaultValue={activeTarget.item.name} required /></Field><Field label="Slug" hint={ar ? 'اسم تقني للرابط، مثل web-development' : 'URL-safe value such as web-development'}><input name="slug" defaultValue={activeTarget.item.slug} required /></Field><Field label={ar ? 'الوصف' : 'Description'} wide><textarea name="description" defaultValue={activeTarget.item.description ?? ''} rows={4} /></Field></div></section>}
        {activeTarget.type === 'speaker' && <section className="editor-section"><h3>{ar ? 'بيانات المتحدث' : 'Speaker details'}</h3><div className="editor-grid"><Field label={ar ? 'اسم المتحدث' : 'Speaker name'}><input name="name" defaultValue={activeTarget.item.name} required /></Field><Field label={ar ? 'الجامعة / الشركة / المؤسسة' : 'University / company / organization'}><input name="organization" defaultValue={activeTarget.item.organization ?? ''} /></Field><Field label={ar ? 'النبذة' : 'Bio'} wide><textarea name="bio" defaultValue={activeTarget.item.bio ?? ''} rows={5} /></Field></div></section>}
        {activeTarget.type === 'series' && <section className="editor-section"><h3>{ar ? 'بيانات السلسلة' : 'Series details'}</h3><div className="editor-grid"><Field label={ar ? 'عنوان السلسلة' : 'Series title'}><input name="title" defaultValue={activeTarget.item.title} required /></Field><Field label={ar ? 'حالة النشر' : 'Publishing status'}><select name="published" defaultValue={activeTarget.item.published ? 'true' : 'false'}><option value="true">{ar ? 'منشورة' : 'Published'}</option><option value="false">{ar ? 'مخفية' : 'Hidden'}</option></select></Field><Field label={ar ? 'الوصف' : 'Description'} wide><textarea name="description" defaultValue={activeTarget.item.description ?? ''} rows={4} /></Field></div></section>}
        {activeTarget.type === 'session' && <><section className="editor-section"><h3>{ar ? 'المحتوى الأساسي' : 'Core content'}</h3><div className="editor-grid"><Field label={ar ? 'عنوان السيشن' : 'Session title'}><input name="title" defaultValue={activeTarget.item.title} required /></Field><Field label="Slug"><input name="slug" defaultValue={activeTarget.item.slug} required /></Field><Field label={ar ? 'الوصف' : 'Description'} wide><textarea name="description" defaultValue={activeTarget.item.description} rows={6} required /></Field></div></section><section className="editor-section"><h3>{ar ? 'الموعد والمكان' : 'Schedule and place'}</h3><div className="editor-grid"><Field label={ar ? 'وقت البداية' : 'Start time'}><input name="starts_at" type="datetime-local" defaultValue={dateTimeLocal(activeTarget.item.starts_at)} required /></Field><Field label={ar ? 'وقت النهاية' : 'End time'}><input name="ends_at" type="datetime-local" defaultValue={dateTimeLocal(activeTarget.item.ends_at)} /></Field><Field label={ar ? 'المكان / رابط الحضور' : 'Location / meeting link'}><input name="location" defaultValue={activeTarget.item.location ?? ''} /></Field><Field label={ar ? 'السعة' : 'Capacity'}><input name="capacity" type="number" min="1" defaultValue={activeTarget.item.capacity} required /></Field></div></section><section className="editor-section"><h3>{ar ? 'التصنيف والتنظيم' : 'Classification and structure'}</h3><div className="editor-grid"><Field label={ar ? 'التصنيف' : 'Category'}><select name="category_id" defaultValue={activeTarget.item.category_id ?? ''}><option value="">{ar ? 'بدون تصنيف' : 'No category'}</option>{categories.map(item => <option key={item.id} value={item.id}>{item.name}</option>)}</select></Field><div className="form-field wide"><span className="field-label">{ar ? 'المتحدثون' : 'Speakers'}</span><div className="speaker-multi-select" role="group" aria-label={ar ? 'اختيار متحدثي السيشن' : 'Choose session speakers'}>{speakers.map(item => <label className="speaker-choice" key={item.id}><input type="checkbox" name="speaker_ids" value={item.id} defaultChecked={selectedSpeakerIds.has(item.id)} /><span><strong>{item.name}</strong>{item.organization && <small>{item.organization}</small>}</span></label>)}</div><span className="field-hint">{ar ? 'اختاري متحدثًا واحدًا أو أكثر. أول اسم محدد يُحفظ أيضًا كمتحدث أساسي للتوافق.' : 'Choose one or more speakers. The first selected speaker is also kept as the primary speaker for compatibility.'}</span></div><Field label={ar ? 'السلسلة' : 'Series'}><select name="series_id" defaultValue={activeTarget.item.series_id ?? ''}><option value="">{ar ? 'بدون سلسلة' : 'No series'}</option>{series.map(item => <option key={item.id} value={item.id}>{item.title}</option>)}</select></Field><Field label={ar ? 'رقم الجزء' : 'Part number'}><input name="series_position" type="number" min="1" defaultValue={activeTarget.item.series_position ?? 1} /></Field><Field label={ar ? 'حالة السيشن' : 'Session status'}><select name="status" defaultValue={activeTarget.item.status}><option value="draft">{ar ? 'مسودة' : 'Draft'}</option><option value="published">{ar ? 'منشور' : 'Published'}</option><option value="cancelled">{ar ? 'ملغي' : 'Cancelled'}</option></select></Field></div></section></>}
        {activeTarget.type === 'video' && <section className="editor-section"><h3>{ar ? 'بيانات التسجيل' : 'Recording details'}</h3><div className="editor-grid"><Field label={ar ? 'عنوان التسجيل' : 'Recording title'}><input name="title" defaultValue={activeTarget.item.title} required /></Field><Field label={ar ? 'السيشن' : 'Session'}><select name="session_id" defaultValue={activeTarget.item.session_id} required>{sessions.map(item => <option key={item.id} value={item.id}>{item.title}</option>)}</select></Field><Field label="Part" hint={ar ? 'اختاري رقم الجزء الذي سيظهر فيه هذا الفيديو.' : 'Choose which part should contain this video.'}><input name="part_number" type="number" min="1" step="1" defaultValue={activeTarget.item.part_number ?? 1} required /></Field><Field label={ar ? 'الترتيب داخل الـPart' : 'Position in part'}><input name="position" type="number" min="0" step="1" defaultValue={activeTarget.item.position} /></Field><Field label={ar ? 'رابط الفيديو' : 'Video URL'} hint={ar ? 'يقبل YouTube أو Google Drive. في Drive اجعلي الملف متاحًا لأي شخص لديه الرابط.' : 'Accepts YouTube or Google Drive. For Drive, allow anyone with the link to view.'} wide><input name="video_url" inputMode="url" defaultValue={videoSourceUrl(activeTarget.item.video_provider, activeTarget.item.youtube_video_id)} required /></Field></div></section>}
        {localError && <p className="notice error">{localError}</p>}
      </div><footer className="editor-actions"><button type="button" className="button button-ghost" onClick={onClose} disabled={busy}>{ar ? 'إلغاء' : 'Cancel'}</button><button type="submit" className="button button-primary" disabled={busy}>{busy ? (ar ? 'جارٍ الحفظ…' : 'Saving…') : (ar ? 'حفظ التغييرات' : 'Save changes')}</button></footer></form>
    </section>
  </div>
}