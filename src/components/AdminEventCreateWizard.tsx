import { useState, type FormEvent } from 'react'
import { useAuth } from '../hooks/useAuth'
import { useUi } from '../hooks/useUi'
import { errorMessage } from '../lib/errors'
import { googleDriveFolderEmbedUrl, parseEventImageSource } from '../lib/eventMedia'
import { supabase } from '../lib/supabase'
import type {
  CompetitionAttendanceMode,
  CompetitionKind,
  CompetitionParticipationMode,
  CompetitionPhase,
  EventStatus,
  EventType,
} from '../types/domain'
import { Icon } from './Icon'
import { useToast } from './ToastProvider'

const eventTypes: Array<{ value: EventType; ar: string; en: string }> = [
  { value: 'cultural', ar: 'ثقافية', en: 'Cultural' },
  { value: 'sports', ar: 'رياضية', en: 'Sports' },
  { value: 'initiative', ar: 'مبادرات وإعمار', en: 'Initiatives & renovation' },
  { value: 'social', ar: 'اجتماعية', en: 'Social' },
  { value: 'academic', ar: 'أكاديمية', en: 'Academic' },
  { value: 'other', ar: 'أخرى', en: 'Other' },
]

type AcademicSubtype = 'regular' | CompetitionKind

type Props = {
  onCreated: (eventId: string, isCompetition: boolean) => void
}

function slugify(value: string) {
  const normalized = value.normalize('NFKD').toLowerCase().replace(/[\u0300-\u036f]/g, '').replace(/[^\p{L}\p{N}]+/gu, '-').replace(/^-+|-+$/g, '').replace(/-{2,}/g, '-')
  return normalized || `event-${Date.now().toString(36)}`
}

function optionalText(value: FormDataEntryValue | null) {
  return String(value || '').trim() || null
}

function optionalNumber(value: FormDataEntryValue | null) {
  const text = String(value || '').trim()
  if (!text) return null
  const number = Number(text)
  return Number.isFinite(number) ? number : null
}

function fromLocalInput(value: FormDataEntryValue | null) {
  const text = String(value || '').trim()
  if (!text) return null
  const date = new Date(text)
  return Number.isNaN(date.getTime()) ? null : date.toISOString()
}

function isPublicUrl(value: string | null) {
  if (!value) return true
  try {
    const url = new URL(value)
    return url.protocol === 'https:' || url.protocol === 'http:'
  } catch {
    return false
  }
}

export function AdminEventCreateWizard({ onCreated }: Props) {
  const { user } = useAuth()
  const { language } = useUi()
  const { showToast } = useToast()
  const ar = language === 'ar'
  const [open, setOpen] = useState(false)
  const [eventType, setEventType] = useState<EventType>('cultural')
  const [academicSubtype, setAcademicSubtype] = useState<AcademicSubtype>('regular')
  const [participationMode, setParticipationMode] = useState<CompetitionParticipationMode>('team')
  const [busy, setBusy] = useState(false)

  const isCompetition = eventType === 'academic' && academicSubtype !== 'regular'

  function resetSmartFields() {
    setEventType('cultural')
    setAcademicSubtype('regular')
    setParticipationMode('team')
  }

  async function create(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    const form = event.currentTarget
    const values = new FormData(form)
    const title = String(values.get('title') || '').trim()
    const eventDate = String(values.get('event_date') || '')
    const description = String(values.get('description') || '').trim()
    const newCover = String(values.get('cover_url') || '').trim()
    const newFolder = String(values.get('drive_folder_url') || '').trim()
    const registrationUrl = optionalText(values.get('registration_url'))

    if (title.length < 2 || !eventDate) {
      showToast({ kind: 'error', title: ar ? 'بيانات ناقصة' : 'Missing details', message: ar ? 'اكتبي اسم الفعالية وتاريخها.' : 'Add the event name and date.' })
      return
    }
    if (isCompetition && !description) {
      showToast({ kind: 'error', title: ar ? 'وصف المسابقة مطلوب' : 'Competition description required', message: ar ? 'اكتبي وصف المسابقة، ومنه تقدري توضحي القوانين والشروط للمشاركين.' : 'Add a competition description where you can also explain rules and participation terms.' })
      return
    }
    if (newCover && !parseEventImageSource(newCover)) {
      showToast({ kind: 'error', title: ar ? 'رابط غير صالح' : 'Invalid link', message: ar ? 'رابط الغلاف غير صالح.' : 'The cover link is not valid.' })
      return
    }
    if (newFolder && !googleDriveFolderEmbedUrl(newFolder)) {
      showToast({ kind: 'error', title: ar ? 'رابط غير صالح' : 'Invalid link', message: ar ? 'رابط مجلد Google Drive غير صالح.' : 'The Google Drive folder link is not valid.' })
      return
    }
    if (isCompetition && !isPublicUrl(registrationUrl)) {
      showToast({ kind: 'error', title: ar ? 'رابط غير صالح' : 'Invalid link', message: ar ? 'راجعي رابط التسجيل.' : 'Check the registration URL.' })
      return
    }

    const minTeam = participationMode === 'individual' ? null : optionalNumber(values.get('min_team_size'))
    const maxTeam = participationMode === 'individual' ? null : optionalNumber(values.get('max_team_size'))
    if (isCompetition && minTeam && maxTeam && minTeam > maxTeam) {
      showToast({ kind: 'error', title: ar ? 'حجم الفريق غير صحيح' : 'Invalid team size', message: ar ? 'عدد أعضاء الفريق «من» ما ممكن يكون أكبر من عدد «إلى».' : 'The minimum team size cannot exceed the maximum.' })
      return
    }

    setBusy(true)
    let createdEventId = ''
    try {
      const eventPayload = {
        title,
        slug: slugify(title),
        description,
        event_type: eventType,
        event_date: eventDate,
        location: optionalText(values.get('location')),
        drive_folder_url: newFolder || null,
        cover_url: newCover || null,
        cover_focus_x: 50,
        cover_focus_y: 50,
        featured: values.get('featured') === 'on',
        status: String(values.get('status') || 'published') as EventStatus,
        created_by: user?.id ?? null,
      }
      const { data: created, error: eventError } = await supabase.from('events').insert(eventPayload).select('id').single()
      if (eventError || !created) throw eventError ?? new Error('Could not create event')
      createdEventId = created.id

      if (isCompetition) {
        const detailsPayload = {
          event_id: created.id,
          competition_kind: academicSubtype as CompetitionKind,
          organizer: optionalText(values.get('organizer')),
          phase: String(values.get('phase') || 'announced') as CompetitionPhase,
          registration_opens_at: fromLocalInput(values.get('registration_opens_at')),
          registration_closes_at: fromLocalInput(values.get('registration_closes_at')),
          competition_starts_at: fromLocalInput(values.get('competition_starts_at')),
          competition_ends_at: fromLocalInput(values.get('competition_ends_at')),
          participation_mode: participationMode,
          min_team_size: minTeam,
          max_team_size: maxTeam,
          attendance_mode: String(values.get('attendance_mode') || 'in_person') as CompetitionAttendanceMode,
          eligibility: optionalText(values.get('eligibility')),
          registration_url: registrationUrl,
          rules_url: null,
          prizes: optionalText(values.get('prizes')),
          tracks: optionalText(values.get('tracks')),
          results_published: false,
          results_published_at: null,
        }
        const { error: competitionError } = await supabase.from('competition_details').insert(detailsPayload)
        if (competitionError) {
          await supabase.from('events').delete().eq('id', created.id)
          createdEventId = ''
          throw competitionError
        }
      }

      form.reset()
      resetSmartFields()
      setOpen(false)
      showToast({
        kind: 'success',
        title: ar ? 'تم الإنشاء' : 'Created',
        message: isCompetition
          ? (ar ? 'تم إنشاء المسابقة مع بياناتها الأساسية. تقدري تكملي المراحل والفائزين من استوديو المسابقات.' : 'Competition created with its core details. Continue with stages and winners in Competition Studio.')
          : (ar ? 'تمت إضافة الفعالية.' : 'Event created.'),
      })
      onCreated(created.id, isCompetition)
    } catch (error) {
      if (createdEventId) console.warn('Event creation partially completed before rollback attempt', createdEventId)
      showToast({ kind: 'error', title: ar ? 'تعذر الإنشاء' : 'Could not create', message: errorMessage(error) })
    } finally {
      setBusy(false)
    }
  }

  return <section className={`smart-event-creator ${open ? 'is-open' : ''}`}>
    <button type="button" className="smart-event-creator-trigger" onClick={() => setOpen((value) => !value)} aria-expanded={open}>
      <span className="smart-event-creator-trigger-icon">＋</span>
      <span><strong>{ar ? 'إضافة فعالية جديدة' : 'Create new event'}</strong><small>{ar ? 'فعالية عادية أو مسابقة أكاديمية من نفس المكان' : 'Regular event or academic competition from one place'}</small></span>
      <b aria-hidden="true">{open ? '−' : '↓'}</b>
    </button>

    {open && <form className="smart-event-creator-form" onSubmit={create}>
      <div className="smart-event-form-heading">
        <span className="eyebrow">{ar ? 'ابدئي بالنوع' : 'Start with the type'}</span>
        <h3>{ar ? 'البيانات تتغير حسب الفعالية' : 'The form adapts to the event'}</h3>
        <p>{ar ? 'اختيار «أكاديمية» يفتح النوع الأكاديمي، واختيار مسابقة يضيف فورًا التسجيل والفرق والجوائز والمواعيد.' : 'Choosing Academic reveals the academic subtype; choosing a competition immediately adds registration, team, prize, and schedule fields.'}</p>
      </div>

      <div className="smart-event-primary-grid">
        <label><span>{ar ? 'اسم الفعالية' : 'Event name'}</span><input name="title" required maxLength={160} /></label>
        <label><span>{ar ? 'التاريخ الرئيسي' : 'Main date'}</span><input name="event_date" type="date" required /></label>
        <label><span>{ar ? 'نوع الفعالية' : 'Event type'}</span><select name="event_type" value={eventType} onChange={(event) => { const next = event.target.value as EventType; setEventType(next); if (next !== 'academic') setAcademicSubtype('regular') }}>{eventTypes.map((type) => <option key={type.value} value={type.value}>{ar ? type.ar : type.en}</option>)}</select></label>
        <label><span>{ar ? 'المكان' : 'Location'}</span><input name="location" /></label>
      </div>

      {eventType === 'academic' && <section className="academic-subtype-panel">
        <div className="academic-subtype-copy"><span>01</span><div><strong>{ar ? 'نوع الفعالية الأكاديمية' : 'Academic event subtype'}</strong><small>{ar ? 'هنا يبدأ الفرق بين الفعالية الأكاديمية العادية والمسابقة.' : 'This is where a regular academic event and a competition diverge.'}</small></div></div>
        <div className="academic-subtype-options">
          <button type="button" className={academicSubtype === 'regular' ? 'active' : ''} onClick={() => setAcademicSubtype('regular')}><strong>{ar ? 'فعالية أكاديمية عادية' : 'Regular academic event'}</strong><small>{ar ? 'ورشة، ندوة، مؤتمر…' : 'Workshop, seminar, conference…'}</small></button>
          <button type="button" className={academicSubtype === 'problem_solving' ? 'active' : ''} onClick={() => setAcademicSubtype('problem_solving')}><strong>Problem Solving</strong><small>{ar ? 'تنافس برمجي' : 'Programming contest'}</small></button>
          <button type="button" className={academicSubtype === 'hackathon' ? 'active' : ''} onClick={() => setAcademicSubtype('hackathon')}><strong>{ar ? 'هاكاثون' : 'Hackathon'}</strong><small>{ar ? 'فرق ومشاريع' : 'Teams & projects'}</small></button>
          <button type="button" className={academicSubtype === 'ctf' ? 'active' : ''} onClick={() => setAcademicSubtype('ctf')}><strong>CTF</strong><small>{ar ? 'تحديات أمنية' : 'Security challenges'}</small></button>
          <button type="button" className={academicSubtype === 'innovation' ? 'active' : ''} onClick={() => setAcademicSubtype('innovation')}><strong>{ar ? 'ابتكار' : 'Innovation'}</strong><small>{ar ? 'أفكار وحلول' : 'Ideas & solutions'}</small></button>
          <button type="button" className={academicSubtype === 'other' ? 'active' : ''} onClick={() => setAcademicSubtype('other')}><strong>{ar ? 'مسابقة أخرى' : 'Other competition'}</strong><small>{ar ? 'قالب مرن' : 'Flexible template'}</small></button>
        </div>
      </section>}

      {isCompetition && <section className="smart-competition-fields">
        <div className="smart-competition-title"><span className="smart-competition-trophy" aria-hidden="true">🏆</span><div><span className="eyebrow">{ar ? 'قالب المسابقة' : 'Competition template'}</span><h4>{ar ? 'بيانات تظهر فقط للمسابقات' : 'Competition-only details'}</h4><p>{ar ? 'التسجيل مستقل عن موعد المسابقة، والنتائج تضاف بعدين كمسودة ثم تنشريها وقت ما تكون جاهزة.' : 'Registration is independent from the competition date, and results can be drafted and published later.'}</p></div></div>

        <div className="smart-competition-grid">
          <label><span>{ar ? 'الجهة المنظمة' : 'Organizer'}</span><input name="organizer" /></label>
          <label><span>{ar ? 'المرحلة الحالية' : 'Current phase'}</span><select name="phase" defaultValue="announced"><option value="announced">{ar ? 'تم الإعلان — التسجيل قريبًا' : 'Announced — registration soon'}</option><option value="registration">{ar ? 'التسجيل مفتوح' : 'Registration open'}</option><option value="in_progress">{ar ? 'المسابقة جارية' : 'Competition in progress'}</option><option value="judging">{ar ? 'التحكيم / انتظار النتائج' : 'Judging / awaiting results'}</option><option value="completed">{ar ? 'انتهت' : 'Completed'}</option></select></label>
          <label><span>{ar ? 'فتح التسجيل' : 'Registration opens'}</span><input name="registration_opens_at" type="datetime-local" /></label>
          <label><span>{ar ? 'قفل التسجيل' : 'Registration closes'}</span><input name="registration_closes_at" type="datetime-local" /></label>
          <label><span>{ar ? 'بداية المسابقة' : 'Competition starts'}</span><input name="competition_starts_at" type="datetime-local" /></label>
          <label><span>{ar ? 'نهاية المسابقة' : 'Competition ends'}</span><input name="competition_ends_at" type="datetime-local" /></label>
          <label><span>{ar ? 'المشاركة' : 'Participation'}</span><select name="participation_mode" value={participationMode} onChange={(event) => setParticipationMode(event.target.value as CompetitionParticipationMode)}><option value="individual">{ar ? 'فردي' : 'Individual'}</option><option value="team">{ar ? 'فرق' : 'Teams'}</option><option value="both">{ar ? 'فردي أو فرق' : 'Individual or teams'}</option></select></label>
          <label><span>{ar ? 'طريقة الحضور' : 'Attendance'}</span><select name="attendance_mode" defaultValue="in_person"><option value="in_person">{ar ? 'حضوري' : 'In person'}</option><option value="online">Online</option><option value="hybrid">Hybrid</option></select></label>
          {participationMode !== 'individual' && <><label><span>{ar ? 'عدد أعضاء الفريق — من' : 'Team size — from'}</span><input name="min_team_size" type="number" min="1" defaultValue="2" /></label><label><span>{ar ? 'عدد أعضاء الفريق — إلى' : 'Team size — to'}</span><input name="max_team_size" type="number" min="1" defaultValue="4" /></label></>}
        </div>

        <label><span>{ar ? 'من يقدر يشارك؟' : 'Eligibility'}</span><textarea name="eligibility" rows={3} placeholder={ar ? 'مثال: طلاب كلية علوم الحاسوب من كل المستويات…' : 'Example: Computer Science students from all levels…'} /></label>
        <label><span>{ar ? 'رابط التسجيل' : 'Registration URL'}</span><input name="registration_url" type="url" placeholder="https://..." /></label>
        <div className="smart-event-primary-grid">
          <label><span>{ar ? 'الجوائز — اختياري' : 'Prizes — optional'}</span><textarea name="prizes" rows={3} placeholder={ar ? 'المركز الأول… المركز الثاني… أو اتركيها فاضية.' : '1st place… 2nd place… or leave blank.'} /></label>
          <label><span>{ar ? 'المسارات / Tracks — اختياري' : 'Tracks — optional'}</span><textarea name="tracks" rows={3} placeholder={ar ? 'Web، AI، Security… أو اتركيها فاضية.' : 'Web, AI, Security… or leave blank.'} /></label>
        </div>
      </section>}

      <section className="smart-event-common-details">
        <div className="smart-common-title"><span>02</span><div><strong>{isCompetition ? (ar ? 'وصف المسابقة والتفاصيل العامة' : 'Competition description & general details') : (ar ? 'التفاصيل العامة' : 'General details')}</strong><small>{isCompetition ? (ar ? 'اكتبي الوصف والقوانين والشروط هنا كنص واضح للمشارك، بدون رابط منفصل للقوانين.' : 'Write the description, rules, and participation terms here as clear text; there is no separate rules link.') : (ar ? 'الغلاف والألبوم تقدرِ تعدليهم بعد الحفظ أيضًا.' : 'Cover and album can still be edited after saving.')}</small></div></div>
        <label><span>{isCompetition ? (ar ? 'وصف المسابقة' : 'Competition description') : (ar ? 'الوصف' : 'Description')}</span><textarea name="description" rows={5} required={isCompetition} placeholder={isCompetition ? (ar ? 'اكتبي فكرة المسابقة، طريقة المشاركة، وأي قوانين أو شروط مهمة…' : 'Describe the competition, participation flow, and any important rules or terms…') : undefined} /></label>
        <div className="smart-event-primary-grid">
          <label><span>{ar ? 'رابط مجلد Drive — اختياري' : 'Drive folder — optional'}</span><input name="drive_folder_url" type="url" placeholder="https://drive.google.com/drive/folders/..." /></label>
          <label><span>{ar ? 'رابط غلاف — اختياري' : 'Cover URL — optional'}</span><input name="cover_url" type="url" placeholder={ar ? 'أو ارفعيه من الجهاز بعد الحفظ' : 'Or upload it from your device after saving'} /></label>
          <label><span>{ar ? 'الحالة' : 'Status'}</span><select name="status" defaultValue="published"><option value="published">{ar ? 'منشورة' : 'Published'}</option><option value="draft">{ar ? 'مسودة' : 'Draft'}</option></select></label>
          <label className="smart-featured-check"><input name="featured" type="checkbox" /><span>{ar ? 'فعالية مميزة' : 'Featured event'}</span></label>
        </div>
      </section>

      <div className="smart-event-create-actions">
        <button className="button button-primary" disabled={busy}>{busy ? (ar ? 'جارٍ الإنشاء…' : 'Creating…') : isCompetition ? (ar ? 'إنشاء المسابقة' : 'Create competition') : (ar ? 'إنشاء الفعالية' : 'Create event')}</button>
        <button className="button" type="button" onClick={() => { setOpen(false); resetSmartFields() }} disabled={busy}>{ar ? 'إلغاء' : 'Cancel'}</button>
      </div>
    </form>}
  </section>
}
