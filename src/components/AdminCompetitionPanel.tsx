import { useEffect, useMemo, useState, type FormEvent } from 'react'
import { competitionKindLabel, competitionPhaseLabel } from '../lib/competition'
import { errorMessage } from '../lib/errors'
import { supabase } from '../lib/supabase'
import type { CollegeEvent, CompetitionDetails, CompetitionStage, CompetitionWinner } from '../types/domain'
import { ConfirmDialog } from './ConfirmDialog'
import { Icon } from './Icon'
import { CompetitionShowcaseAdmin } from './CompetitionShowcaseAdmin'
import { useToast } from './ToastProvider'
import { useUi } from '../hooks/useUi'

function toLocalInput(value: string | null) {
  if (!value) return ''
  const date = new Date(value)
  const offset = date.getTimezoneOffset() * 60_000
  return new Date(date.getTime() - offset).toISOString().slice(0, 16)
}

function fromLocalInput(value: FormDataEntryValue | null) {
  const text = String(value || '').trim()
  if (!text) return null
  const date = new Date(text)
  return Number.isNaN(date.getTime()) ? null : date.toISOString()
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

function isPublicUrl(value: string | null) {
  if (!value) return true
  try {
    const url = new URL(value)
    return url.protocol === 'https:' || url.protocol === 'http:'
  } catch {
    return false
  }
}

export function AdminCompetitionPanel({ event }: { event: CollegeEvent }) {
  const { language } = useUi()
  const { showToast } = useToast()
  const ar = language === 'ar'
  const [details, setDetails] = useState<CompetitionDetails | null>(null)
  const [stages, setStages] = useState<CompetitionStage[]>([])
  const [winners, setWinners] = useState<CompetitionWinner[]>([])
  const [loading, setLoading] = useState(true)
  const [busy, setBusy] = useState(false)
  const [removeTemplate, setRemoveTemplate] = useState(false)

  function success(message: string) { showToast({ kind: 'success', title: ar ? 'تم بنجاح' : 'Success', message }) }
  function fail(error: unknown) { showToast({ kind: 'error', title: ar ? 'تعذر التنفيذ' : 'Could not complete action', message: errorMessage(error) }) }

  async function load() {
    setLoading(true)
    try {
      const [detailsResult, stagesResult, winnersResult] = await Promise.all([
        supabase.from('competition_details').select('*').eq('event_id', event.id).maybeSingle(),
        supabase.from('competition_stages').select('*').eq('event_id', event.id).order('position').order('stage_at'),
        supabase.from('competition_winners').select('*').eq('event_id', event.id).order('position').order('rank'),
      ])
      if (detailsResult.error) throw detailsResult.error
      if (stagesResult.error) throw stagesResult.error
      if (winnersResult.error) throw winnersResult.error
      setDetails((detailsResult.data as CompetitionDetails | null) ?? null)
      setStages((stagesResult.data ?? []) as CompetitionStage[])
      setWinners((winnersResult.data ?? []) as CompetitionWinner[])
    } catch (error) { fail(error) }
    finally { setLoading(false) }
  }

  useEffect(() => { void load() }, [event.id])

  const orderedWinners = useMemo(() => [...winners].sort((a, b) => (a.rank ?? 999) - (b.rank ?? 999) || a.position - b.position), [winners])

  async function activateTemplate() {
    setBusy(true)
    try {
      const { error } = await supabase.from('competition_details').insert({
        event_id: event.id,
        competition_kind: 'problem_solving',
        phase: 'announced',
        participation_mode: 'team',
        min_team_size: 2,
        max_team_size: 4,
        attendance_mode: 'in_person',
      })
      if (error) throw error
      success(ar ? 'تم تفعيل قالب المسابقة. كمّلي البيانات والمواعيد ثم احفظي.' : 'Competition template enabled. Complete the details and dates, then save.')
      await load()
    } catch (error) { fail(error) }
    finally { setBusy(false) }
  }

  async function saveDetails(formEvent: FormEvent<HTMLFormElement>) {
    formEvent.preventDefault()
    if (!details) return
    const values = new FormData(formEvent.currentTarget)
    const description = String(values.get('description') || '').trim()
    const registrationUrl = optionalText(values.get('registration_url'))
    if (!description) return fail(new Error(ar ? 'وصف المسابقة مطلوب.' : 'Competition description is required.'))
    if (!isPublicUrl(registrationUrl)) return fail(new Error(ar ? 'رابط التسجيل غير صالح.' : 'Registration URL is invalid.'))

    const participationMode = String(values.get('participation_mode') || 'team') as CompetitionDetails['participation_mode']
    const minTeam = participationMode === 'individual' ? null : optionalNumber(values.get('min_team_size'))
    const maxTeam = participationMode === 'individual' ? null : optionalNumber(values.get('max_team_size'))
    if (minTeam && maxTeam && minTeam > maxTeam) return fail(new Error(ar ? 'عدد أعضاء الفريق «من» لا يمكن أن يكون أكبر من عدد «إلى».' : 'Minimum team size cannot exceed the maximum.'))

    setBusy(true)
    try {
      const patch = {
        competition_kind: String(values.get('competition_kind') || 'problem_solving') as CompetitionDetails['competition_kind'],
        organizer: optionalText(values.get('organizer')),
        phase: String(values.get('phase') || 'announced') as CompetitionDetails['phase'],
        registration_opens_at: fromLocalInput(values.get('registration_opens_at')),
        registration_closes_at: fromLocalInput(values.get('registration_closes_at')),
        competition_starts_at: fromLocalInput(values.get('competition_starts_at')),
        competition_ends_at: fromLocalInput(values.get('competition_ends_at')),
        participation_mode: participationMode,
        min_team_size: minTeam,
        max_team_size: maxTeam,
        attendance_mode: String(values.get('attendance_mode') || 'in_person') as CompetitionDetails['attendance_mode'],
        eligibility: optionalText(values.get('eligibility')),
        registration_url: registrationUrl,
        rules_url: null,
        prizes: optionalText(values.get('prizes')),
        tracks: optionalText(values.get('tracks')),
        updated_at: new Date().toISOString(),
      }
      const [competitionResult, eventResult] = await Promise.all([
        supabase.from('competition_details').update(patch).eq('event_id', event.id),
        supabase.from('events').update({ description }).eq('id', event.id),
      ])
      if (competitionResult.error) throw competitionResult.error
      if (eventResult.error) throw eventResult.error
      success(ar ? 'تم حفظ بيانات المسابقة.' : 'Competition details saved.')
      await load()
    } catch (error) { fail(error) }
    finally { setBusy(false) }
  }

  async function addStage(formEvent: FormEvent<HTMLFormElement>) {
    formEvent.preventDefault()
    const form = formEvent.currentTarget
    const values = new FormData(form)
    const title = String(values.get('title') || '').trim()
    if (!title) return
    setBusy(true)
    try {
      const position = stages.reduce((max, item) => Math.max(max, item.position), 0) + 1
      const { error } = await supabase.from('competition_stages').insert({
        event_id: event.id,
        title,
        stage_at: fromLocalInput(values.get('stage_at')),
        description: optionalText(values.get('description')),
        position,
      })
      if (error) throw error
      form.reset()
      success(ar ? 'تمت إضافة المرحلة للـTimeline.' : 'Timeline stage added.')
      await load()
    } catch (error) { fail(error) }
    finally { setBusy(false) }
  }

  async function removeStage(stage: CompetitionStage) {
    setBusy(true)
    try {
      const { error } = await supabase.from('competition_stages').delete().eq('id', stage.id)
      if (error) throw error
      await load()
    } catch (error) { fail(error) }
    finally { setBusy(false) }
  }

  async function addWinner(formEvent: FormEvent<HTMLFormElement>) {
    formEvent.preventDefault()
    const form = formEvent.currentTarget
    const values = new FormData(form)
    const entryName = String(values.get('entry_name') || '').trim()
    const projectUrl = optionalText(values.get('project_url'))
    if (!entryName) return fail(new Error(ar ? 'اكتبي اسم الفائز أو الفريق.' : 'Add the winner or team name.'))
    if (!isPublicUrl(projectUrl)) return fail(new Error(ar ? 'رابط المشروع غير صالح.' : 'Project URL is invalid.'))

    setBusy(true)
    try {
      const position = winners.reduce((max, item) => Math.max(max, item.position), 0) + 1
      const { error } = await supabase.from('competition_winners').insert({
        event_id: event.id,
        rank: optionalNumber(values.get('rank')),
        award_title: optionalText(values.get('award_title')),
        entry_name: entryName,
        members: optionalText(values.get('members')),
        project_title: optionalText(values.get('project_title')),
        prize: optionalText(values.get('prize')),
        project_url: projectUrl,
        image_url: null,
        position,
      })
      if (error) throw error
      form.reset()
      success(ar ? 'تمت إضافة الفائز كمسودة. لن يظهر للطلاب قبل نشر النتائج.' : 'Winner added as a draft. It stays hidden until results are published.')
      await load()
    } catch (error) { fail(error) }
    finally { setBusy(false) }
  }

  async function removeWinner(winner: CompetitionWinner) {
    setBusy(true)
    try {
      const { error } = await supabase.from('competition_winners').delete().eq('id', winner.id)
      if (error) throw error
      await load()
    } catch (error) { fail(error) }
    finally { setBusy(false) }
  }

  async function toggleResults(publish: boolean) {
    if (!details) return
    if (publish && !winners.length) return fail(new Error(ar ? 'أضيفي فائزًا واحدًا على الأقل قبل نشر النتائج.' : 'Add at least one winner before publishing results.'))
    setBusy(true)
    try {
      const patch = {
        results_published: publish,
        results_published_at: publish ? new Date().toISOString() : null,
        phase: (publish ? 'completed' : details.phase) as CompetitionDetails['phase'],
        updated_at: new Date().toISOString(),
      }
      const { error } = await supabase.from('competition_details').update(patch).eq('event_id', event.id)
      if (error) throw error
      success(publish ? (ar ? 'تم نشر النتائج والفائزين للطلاب.' : 'Results and winners are now published.') : (ar ? 'تم إخفاء النتائج وإعادتها لمسودة.' : 'Results are hidden and back in draft.'))
      await load()
    } catch (error) { fail(error) }
    finally { setBusy(false) }
  }

  async function removeCompetitionTemplate() {
    setBusy(true)
    try {
      const { error } = await supabase.from('competition_details').delete().eq('event_id', event.id)
      if (error) throw error
      setRemoveTemplate(false)
      success(ar ? 'رجعت الفعالية أكاديمية عادية وحُذفت بيانات قالب المسابقة.' : 'The event is back to a regular academic event and competition data was removed.')
      await load()
    } catch (error) { fail(error) }
    finally { setBusy(false) }
  }

  if (loading) return <div className="page-state compact">{ar ? 'جارٍ تحميل قالب المسابقة…' : 'Loading competition template…'}</div>

  if (!details) return <section className="competition-enable-card">
    <div className="competition-enable-mark" aria-hidden="true">🏆</div>
    <div><span className="eyebrow">{ar ? 'قالب أكاديمي متقدم' : 'Advanced academic template'}</span><h4>{ar ? 'حوّلي الفعالية إلى مسابقة' : 'Turn this event into a competition'}</h4><p>{ar ? 'يضيف التسجيل، الفرق، مواعيد المسابقة، الجوائز، المراحل، والتحكيم والفائزين — بدون تغيير نظام الفعاليات العادية.' : 'Adds registration, teams, dates, prizes, stages, judging, and winners without changing regular events.'}</p></div>
    <button className="button button-primary" type="button" onClick={() => void activateTemplate()} disabled={busy}>{ar ? 'تفعيل قالب المسابقة' : 'Enable competition template'}</button>
  </section>

  return <div className="admin-competition-panel">
    <section className="competition-admin-head">
      <div><span className="eyebrow">{competitionKindLabel(details.competition_kind, ar)}</span><h4>{ar ? 'إدارة المسابقة' : 'Competition workspace'}</h4><p>{ar ? 'التسجيل مستقل عن المسابقة والنتائج. زر التسجيل يظهر فقط خلال مرحلة التسجيل، والفائزون لا يظهرون إلا بعد نشر النتائج.' : 'Registration, competition, and results are independent. The registration CTA only appears during registration, and winners stay hidden until results are published.'}</p></div>
      <span className={`competition-admin-status phase-${details.phase}`}>{details.results_published ? (ar ? 'النتائج منشورة' : 'Results published') : competitionPhaseLabel(details.phase, ar)}</span>
    </section>

    <form className="competition-details-form" onSubmit={saveDetails}>
      <div className="competition-form-section-title"><span>01</span><div><strong>{ar ? 'هوية المسابقة' : 'Competition identity'}</strong><small>{ar ? 'النوع، الوصف، الجهة المنظمة، وطريقة المشاركة.' : 'Type, description, organizer, and participation model.'}</small></div></div>
      <div className="admin-event-two">
        <label><span>{ar ? 'نوع المسابقة' : 'Competition type'}</span><select name="competition_kind" defaultValue={details.competition_kind}><option value="problem_solving">Problem Solving</option><option value="hackathon">{ar ? 'هاكاثون' : 'Hackathon'}</option><option value="ctf">CTF</option><option value="innovation">{ar ? 'ابتكار' : 'Innovation'}</option><option value="other">{ar ? 'أخرى' : 'Other'}</option></select></label>
        <label><span>{ar ? 'المرحلة الحالية' : 'Current phase'}</span><select name="phase" defaultValue={details.phase}><option value="announced">{ar ? 'تم الإعلان — التسجيل قريبًا' : 'Announced — registration soon'}</option><option value="registration">{ar ? 'مرحلة التسجيل' : 'Registration'}</option><option value="in_progress">{ar ? 'المسابقة جارية' : 'In progress'}</option><option value="judging">{ar ? 'التحكيم / انتظار النتائج' : 'Judging / awaiting results'}</option><option value="completed">{ar ? 'انتهت' : 'Completed'}</option></select></label>
      </div>
      <label><span>{ar ? 'وصف المسابقة' : 'Competition description'}</span><textarea name="description" rows={5} required defaultValue={event.description ?? ''} placeholder={ar ? 'اكتبي فكرة المسابقة، طريقة المشاركة، وأي قوانين أو شروط مهمة…' : 'Describe the competition, participation flow, and any important rules or terms…'} /><small className="field-hint">{ar ? 'القوانين والشروط تُكتب هنا كنص؛ ما في رابط منفصل للقوانين.' : 'Write rules and participation terms here as text; there is no separate rules link.'}</small></label>
      <label><span>{ar ? 'الجهة المنظمة' : 'Organizer'}</span><input name="organizer" defaultValue={details.organizer ?? ''} placeholder={ar ? 'مثلاً: نادي البرمجة — كلية علوم الحاسوب' : 'e.g. Programming Club — CS College'} /></label>
      <div className="admin-event-two">
        <label><span>{ar ? 'المشاركة' : 'Participation'}</span><select name="participation_mode" defaultValue={details.participation_mode}><option value="individual">{ar ? 'فردي' : 'Individual'}</option><option value="team">{ar ? 'فرق' : 'Teams'}</option><option value="both">{ar ? 'فردي أو فرق' : 'Individual or teams'}</option></select></label>
        <label><span>{ar ? 'طريقة الحضور' : 'Attendance'}</span><select name="attendance_mode" defaultValue={details.attendance_mode}><option value="in_person">{ar ? 'حضوري' : 'In person'}</option><option value="online">{ar ? 'أونلاين' : 'Online'}</option><option value="hybrid">{ar ? 'هجين' : 'Hybrid'}</option></select></label>
      </div>
      <div className="admin-event-two">
        <label><span>{ar ? 'عدد أعضاء الفريق — من' : 'Team size — from'}</span><input name="min_team_size" type="number" min="1" max="50" defaultValue={details.min_team_size ?? ''} /></label>
        <label><span>{ar ? 'عدد أعضاء الفريق — إلى' : 'Team size — to'}</span><input name="max_team_size" type="number" min="1" max="50" defaultValue={details.max_team_size ?? ''} /></label>
      </div>

      <div className="competition-form-section-title"><span>02</span><div><strong>{ar ? 'التسجيل والمواعيد' : 'Registration and dates'}</strong><small>{ar ? 'زر «سجّل الآن» يعتمد على هذه المرحلة والمواعيد فقط.' : 'The “Register now” CTA depends only on this phase and these dates.'}</small></div></div>
      <div className="admin-event-two">
        <label><span>{ar ? 'فتح التسجيل' : 'Registration opens'}</span><input name="registration_opens_at" type="datetime-local" defaultValue={toLocalInput(details.registration_opens_at)} /></label>
        <label><span>{ar ? 'إغلاق التسجيل' : 'Registration closes'}</span><input name="registration_closes_at" type="datetime-local" defaultValue={toLocalInput(details.registration_closes_at)} /></label>
      </div>
      <div className="admin-event-two">
        <label><span>{ar ? 'بداية المسابقة' : 'Competition starts'}</span><input name="competition_starts_at" type="datetime-local" defaultValue={toLocalInput(details.competition_starts_at)} /></label>
        <label><span>{ar ? 'نهاية المسابقة' : 'Competition ends'}</span><input name="competition_ends_at" type="datetime-local" defaultValue={toLocalInput(details.competition_ends_at)} /></label>
      </div>
      <label><span>{ar ? 'رابط التسجيل' : 'Registration URL'}</span><input name="registration_url" type="url" defaultValue={details.registration_url ?? ''} placeholder="https://..." /></label>
      <label><span>{ar ? 'من يقدر يشارك؟' : 'Eligibility'}</span><textarea name="eligibility" rows={3} defaultValue={details.eligibility ?? ''} placeholder={ar ? 'مثلاً: طلاب الجامعة، جميع المستويات، أساسيات البرمجة مطلوبة…' : 'e.g. university students, all levels, basic programming required…'} /></label>

      <div className="competition-form-section-title"><span>03</span><div><strong>{ar ? 'معلومات إضافية' : 'Additional details'}</strong><small>{ar ? 'الجوائز والمسارات اختيارية بالكامل؛ اتركي أي واحدة فاضية لو ما كانت موجودة.' : 'Prizes and tracks are fully optional; leave either blank when not applicable.'}</small></div></div>
      <label><span>{ar ? 'الجوائز — اختياري' : 'Prizes — optional'}</span><textarea name="prizes" rows={3} defaultValue={details.prizes ?? ''} placeholder={ar ? 'كل جائزة في سطر، أو اتركيها فاضية.' : 'One prize per line, or leave blank.'} /></label>
      <label><span>{ar ? 'المسارات / Tracks — اختياري' : 'Tracks — optional'}</span><textarea name="tracks" rows={3} defaultValue={details.tracks ?? ''} placeholder={ar ? 'Web، AI، Security… أو اتركيها فاضية.' : 'Web, AI, Security… or leave blank.'} /></label>
      <button className="button button-primary" disabled={busy}>{ar ? 'حفظ بيانات المسابقة' : 'Save competition details'}</button>
    </form>

    <section className="competition-admin-section">
      <div className="competition-admin-section-head"><div><span className="eyebrow">{ar ? 'Timeline' : 'Timeline'}</span><h4>{ar ? 'مراحل المسابقة' : 'Competition stages'}</h4></div><small>{ar ? 'اختياري' : 'Optional'}</small></div>
      <form className="competition-inline-form" onSubmit={addStage}>
        <input name="title" required maxLength={160} placeholder={ar ? 'اسم المرحلة — مثال: التصفيات' : 'Stage — e.g. Qualifiers'} />
        <input name="stage_at" type="datetime-local" />
        <input name="description" placeholder={ar ? 'وصف قصير — اختياري' : 'Short note — optional'} />
        <button className="button" disabled={busy}>{ar ? 'إضافة مرحلة' : 'Add stage'}</button>
      </form>
      {stages.length > 0 && <div className="competition-stage-admin-list">{stages.map((stage, index) => <article key={stage.id}><span>{String(index + 1).padStart(2, '0')}</span><div><strong dir="auto">{stage.title}</strong>{stage.stage_at && <small>{new Intl.DateTimeFormat(ar ? 'ar-SA' : 'en-US', { dateStyle: 'medium', timeStyle: 'short' }).format(new Date(stage.stage_at))}</small>}{stage.description && <p dir="auto">{stage.description}</p>}</div><button className="text-action danger-text" type="button" onClick={() => void removeStage(stage)} disabled={busy}>{ar ? 'حذف' : 'Delete'}</button></article>)}</div>}
    </section>

    <section className="competition-admin-section competition-results-admin">
      <div className="competition-admin-section-head"><div><span className="eyebrow">{ar ? 'النتائج والفائزون' : 'Results & winners'}</span><h4>{details.results_published ? (ar ? 'النتائج منشورة للطلاب' : 'Results are public') : (ar ? 'النتائج ما زالت مسودة' : 'Results are still draft')}</h4></div><button type="button" className={`button ${details.results_published ? '' : 'button-primary'}`} onClick={() => void toggleResults(!details.results_published)} disabled={busy}>{details.results_published ? (ar ? 'إخفاء النتائج' : 'Unpublish results') : (ar ? 'نشر النتائج' : 'Publish results')}</button></div>
      <p className="competition-results-note">{ar ? 'أضيفي الفائزين براحتك. الأسماء لا تظهر للعامة إطلاقًا قبل الضغط على «نشر النتائج».' : 'Add winners at your pace. Names remain completely private until you press “Publish results”.'}</p>
      <form className="competition-winner-form" onSubmit={addWinner}>
        <div className="admin-event-two"><label><span>{ar ? 'المركز' : 'Rank'}</span><input name="rank" type="number" min="1" max="100" placeholder="1" /></label><label><span>{ar ? 'اسم الجائزة' : 'Award label'}</span><input name="award_title" placeholder={ar ? 'المركز الأول / أفضل فكرة…' : '1st place / Best idea…'} /></label></div>
        <label><span>{ar ? 'اسم الفائز أو الفريق' : 'Winner / team name'}</span><input name="entry_name" required /></label>
        <label><span>{ar ? 'أعضاء الفريق' : 'Team members'}</span><textarea name="members" rows={2} placeholder={ar ? 'كل اسم في سطر — اختياري' : 'One name per line — optional'} /></label>
        <div className="admin-event-two"><label><span>{ar ? 'اسم المشروع' : 'Project title'}</span><input name="project_title" /></label><label><span>{ar ? 'الجائزة' : 'Prize'}</span><input name="prize" /></label></div>
        <label><span>{ar ? 'رابط المشروع — اختياري' : 'Project URL — optional'}</span><input name="project_url" type="url" /></label>
        <button className="button" disabled={busy}>{ar ? 'إضافة الفائز كمسودة' : 'Add winner as draft'}</button>
      </form>
      {orderedWinners.length > 0 && <div className="competition-winner-admin-list">{orderedWinners.map((winner) => <article key={winner.id}><span className="competition-admin-rank">{winner.rank ? `#${winner.rank}` : '★'}</span><div><strong dir="auto">{winner.entry_name}</strong><small dir="auto">{winner.award_title || winner.project_title || (ar ? 'فائز' : 'Winner')}</small>{winner.members && <p dir="auto">{winner.members}</p>}</div><button className="text-action danger-text" type="button" onClick={() => void removeWinner(winner)} disabled={busy}>{ar ? 'حذف' : 'Delete'}</button></article>)}</div>}
    </section>

    <CompetitionShowcaseAdmin eventId={event.id} resultsPublished={details.results_published} showcasePublished={Boolean(details.showcase_published)} winners={orderedWinners} />

    <button className="competition-remove-template" type="button" onClick={() => setRemoveTemplate(true)}>{ar ? 'إلغاء قالب المسابقة وإرجاعها فعالية أكاديمية عادية' : 'Remove competition template and return to a regular academic event'}</button>

    <ConfirmDialog open={removeTemplate} title={ar ? 'إلغاء قالب المسابقة؟' : 'Remove competition template?'} description={ar ? 'سيتم حذف بيانات المسابقة والمراحل والفائزين فقط. بيانات الفعالية وغلافها وألبومها ستظل كما هي.' : 'Competition details, stages, and winners will be removed. The event, cover, and album will stay intact.'} confirmLabel={ar ? 'نعم، إلغاء القالب' : 'Yes, remove template'} cancelLabel={ar ? 'الاحتفاظ به' : 'Keep template'} tone="danger" busy={busy} onCancel={() => !busy && setRemoveTemplate(false)} onConfirm={() => void removeCompetitionTemplate()} />
  </div>
}
