import { useEffect, useMemo, useState, type FormEvent } from 'react'
import { competitionKindLabel } from '../lib/competition'
import { errorMessage } from '../lib/errors'
import { supabase } from '../lib/supabase'
import type { CollegeEvent, CompetitionDetails, CompetitionStage, CompetitionWinner } from '../types/domain'
import { ConfirmDialog } from './ConfirmDialog'
import { CompetitionShowcaseAdmin } from './CompetitionShowcaseAdmin'
import { CompetitionWinnerEditor } from './CompetitionWinnerEditor'
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
  const [stageDeleteTarget, setStageDeleteTarget] = useState<CompetitionStage | null>(null)
  const [winnerDeleteTarget, setWinnerDeleteTarget] = useState<CompetitionWinner | null>(null)

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
        phase: 'completed',
        participation_mode: 'team',
        min_team_size: 2,
        max_team_size: 4,
        attendance_mode: 'in_person',
        registration_opens_at: null,
        registration_closes_at: null,
        registration_url: null,
      })
      if (error) throw error
      success(ar ? 'تم تفعيل قالب أرشيف المسابقة. أضيفي البيانات التاريخية والنتائج والمشاركات.' : 'Competition archive enabled. Add historical details, results, and participant work.')
      await load()
    } catch (error) { fail(error) }
    finally { setBusy(false) }
  }

  async function saveDetails(formEvent: FormEvent<HTMLFormElement>) {
    formEvent.preventDefault()
    if (!details) return
    const values = new FormData(formEvent.currentTarget)
    const description = String(values.get('description') || '').trim()
    if (!description) return fail(new Error(ar ? 'وصف المسابقة مطلوب.' : 'Competition description is required.'))

    const participationMode = String(values.get('participation_mode') || 'team') as CompetitionDetails['participation_mode']
    const minTeam = participationMode === 'individual' ? null : optionalNumber(values.get('min_team_size'))
    const maxTeam = participationMode === 'individual' ? null : optionalNumber(values.get('max_team_size'))
    if (minTeam && maxTeam && minTeam > maxTeam) return fail(new Error(ar ? 'عدد أعضاء الفريق «من» لا يمكن أن يكون أكبر من عدد «إلى».' : 'Minimum team size cannot exceed the maximum.'))

    setBusy(true)
    try {
      const patch = {
        competition_kind: String(values.get('competition_kind') || 'problem_solving') as CompetitionDetails['competition_kind'],
        organizer: optionalText(values.get('organizer')),
        phase: 'completed' as CompetitionDetails['phase'],
        registration_opens_at: null,
        registration_closes_at: null,
        competition_starts_at: fromLocalInput(values.get('competition_starts_at')),
        competition_ends_at: fromLocalInput(values.get('competition_ends_at')),
        participation_mode: participationMode,
        min_team_size: minTeam,
        max_team_size: maxTeam,
        attendance_mode: String(values.get('attendance_mode') || 'in_person') as CompetitionDetails['attendance_mode'],
        eligibility: optionalText(values.get('eligibility')),
        registration_url: null,
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
      success(ar ? 'تم حفظ بيانات أرشيف المسابقة.' : 'Competition archive details saved.')
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
      success(ar ? 'تمت إضافة المرحلة لرحلة المسابقة.' : 'Competition journey stage added.')
      await load()
    } catch (error) { fail(error) }
    finally { setBusy(false) }
  }

  async function removeStage() {
    if (!stageDeleteTarget) return
    setBusy(true)
    try {
      const { error } = await supabase.from('competition_stages').delete().eq('id', stageDeleteTarget.id)
      if (error) throw error
      setStageDeleteTarget(null)
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
      success(ar ? 'تمت إضافة الفائز كمسودة.' : 'Winner added as a draft.')
      await load()
    } catch (error) { fail(error) }
    finally { setBusy(false) }
  }

  async function removeWinner() {
    if (!winnerDeleteTarget) return
    setBusy(true)
    try {
      const { error } = await supabase.from('competition_winners').delete().eq('id', winnerDeleteTarget.id)
      if (error) throw error
      setWinnerDeleteTarget(null)
      await load()
    } catch (error) { fail(error) }
    finally { setBusy(false) }
  }

  async function toggleResults(publish: boolean) {
    if (!details) return
    if (publish && !winners.length) return fail(new Error(ar ? 'أضيفي فائزًا واحدًا على الأقل قبل نشر النتائج.' : 'Add at least one winner before publishing results.'))
    setBusy(true)
    try {
      const { error } = await supabase.from('competition_details').update({
        results_published: publish,
        results_published_at: publish ? new Date().toISOString() : null,
        phase: 'completed',
        updated_at: new Date().toISOString(),
      }).eq('event_id', event.id)
      if (error) throw error
      success(publish ? (ar ? 'تم نشر النتائج والفائزين.' : 'Results and winners published.') : (ar ? 'تم إخفاء النتائج وإعادتها لمسودة.' : 'Results are hidden and back in draft.'))
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
    <div><span className="eyebrow">{ar ? 'قالب الأرشيف الأكاديمي' : 'Academic archive template'}</span><h4>{ar ? 'حوّلي الفعالية إلى مسابقة مؤرشفة' : 'Turn this event into an archived competition'}</h4><p>{ar ? 'يضيف بيانات المسابقة التاريخية، المراحل، النتائج، الفائزين، ومشاريع المشاركين—بدون حالة تسجيل حية.' : 'Adds historical competition details, stages, results, winners, and participant projects without live registration status.'}</p></div>
    <button className="button button-primary" type="button" onClick={() => void activateTemplate()} disabled={busy}>{ar ? 'تفعيل قالب المسابقة' : 'Enable competition template'}</button>
  </section>

  return <div className="admin-competition-panel">
    <section className="competition-admin-head">
      <div><span className="eyebrow">{competitionKindLabel(details.competition_kind, ar)}</span><h4>{ar ? 'إدارة أرشيف المسابقة' : 'Competition archive workspace'}</h4><p>{ar ? 'المسابقة هنا حدث انتهى وتم توثيقه. أضيفي بياناتها التاريخية والنتائج والمشاريع بدون حالات تسجيل أو انتظار.' : 'This is an archive of a completed competition. Add historical details, results, and projects without live registration states.'}</p></div>
      <span className="competition-admin-status phase-completed">{ar ? 'مسابقة مؤرشفة' : 'Archived competition'}</span>
    </section>

    <form className="competition-details-form" onSubmit={saveDetails}>
      <div className="competition-form-section-title"><span>01</span><div><strong>{ar ? 'هوية المسابقة' : 'Competition identity'}</strong><small>{ar ? 'النوع، الوصف، الجهة المنظمة، وطريقة المشاركة.' : 'Type, description, organizer, and participation model.'}</small></div></div>
      <div className="admin-event-two">
        <label><span>{ar ? 'نوع المسابقة' : 'Competition type'}</span><select name="competition_kind" defaultValue={details.competition_kind}><option value="problem_solving">Problem Solving</option><option value="hackathon">{ar ? 'هاكاثون' : 'Hackathon'}</option><option value="ctf">CTF</option><option value="innovation">{ar ? 'ابتكار' : 'Innovation'}</option><option value="other">{ar ? 'أخرى' : 'Other'}</option></select></label>
        <label><span>{ar ? 'الجهة المنظمة' : 'Organizer'}</span><input name="organizer" defaultValue={details.organizer ?? ''} placeholder={ar ? 'مثلاً: نادي البرمجة — كلية علوم الحاسوب' : 'e.g. Programming Club — CS College'} /></label>
      </div>
      <label><span>{ar ? 'وصف المسابقة' : 'Competition description'}</span><textarea name="description" rows={5} required defaultValue={event.description ?? ''} placeholder={ar ? 'اكتبي فكرة المسابقة، كيف تمت، وأي قوانين أو شروط كانت مهمة…' : 'Describe the competition, how it ran, and any important rules or terms…'} /><small className="field-hint">{ar ? 'القوانين والشروط التاريخية تُكتب هنا كنص؛ ما في رابط منفصل للقوانين.' : 'Historical rules and terms are written here as text; there is no separate rules link.'}</small></label>
      <div className="admin-event-two">
        <label><span>{ar ? 'المشاركة' : 'Participation'}</span><select name="participation_mode" defaultValue={details.participation_mode}><option value="individual">{ar ? 'فردي' : 'Individual'}</option><option value="team">{ar ? 'فرق' : 'Teams'}</option><option value="both">{ar ? 'فردي أو فرق' : 'Individual or teams'}</option></select></label>
        <label><span>{ar ? 'طريقة الحضور' : 'Attendance'}</span><select name="attendance_mode" defaultValue={details.attendance_mode}><option value="in_person">{ar ? 'حضوري' : 'In person'}</option><option value="online">{ar ? 'أونلاين' : 'Online'}</option><option value="hybrid">{ar ? 'هجين' : 'Hybrid'}</option></select></label>
      </div>
      <div className="admin-event-two">
        <label><span>{ar ? 'عدد أعضاء الفريق — من' : 'Team size — from'}</span><input name="min_team_size" type="number" min="1" max="50" defaultValue={details.min_team_size ?? ''} /></label>
        <label><span>{ar ? 'عدد أعضاء الفريق — إلى' : 'Team size — to'}</span><input name="max_team_size" type="number" min="1" max="50" defaultValue={details.max_team_size ?? ''} /></label>
      </div>

      <div className="competition-form-section-title"><span>02</span><div><strong>{ar ? 'التاريخ' : 'Dates'}</strong><small>{ar ? 'تواريخ المسابقة نفسها للتوثيق، بدون فتح أو قفل تسجيل.' : 'Competition dates for archival context, without registration states.'}</small></div></div>
      <div className="admin-event-two">
        <label><span>{ar ? 'بداية المسابقة — اختياري' : 'Competition started — optional'}</span><input name="competition_starts_at" type="datetime-local" defaultValue={toLocalInput(details.competition_starts_at)} /></label>
        <label><span>{ar ? 'نهاية المسابقة — اختياري' : 'Competition ended — optional'}</span><input name="competition_ends_at" type="datetime-local" defaultValue={toLocalInput(details.competition_ends_at)} /></label>
      </div>
      <label><span>{ar ? 'من كان يقدر يشارك؟ — اختياري' : 'Eligibility — optional'}</span><textarea name="eligibility" rows={3} defaultValue={details.eligibility ?? ''} placeholder={ar ? 'مثلاً: طلاب الجامعة، جميع المستويات…' : 'e.g. university students, all levels…'} /></label>

      <div className="competition-form-section-title"><span>03</span><div><strong>{ar ? 'معلومات إضافية' : 'Additional details'}</strong><small>{ar ? 'الجوائز والمسارات اختيارية بالكامل.' : 'Prizes and tracks are fully optional.'}</small></div></div>
      <label><span>{ar ? 'الجوائز — اختياري' : 'Prizes — optional'}</span><textarea name="prizes" rows={3} defaultValue={details.prizes ?? ''} placeholder={ar ? 'كل جائزة في سطر، أو اتركيها فاضية.' : 'One prize per line, or leave blank.'} /></label>
      <label><span>{ar ? 'المسارات / Tracks — اختياري' : 'Tracks — optional'}</span><textarea name="tracks" rows={3} defaultValue={details.tracks ?? ''} placeholder={ar ? 'Web، AI، Security… أو اتركيها فاضية.' : 'Web, AI, Security… or leave blank.'} /></label>
      <button className="button button-primary" disabled={busy}>{ar ? 'حفظ بيانات المسابقة' : 'Save competition details'}</button>
    </form>

    <section className="competition-admin-section">
      <div className="competition-admin-section-head"><div><span className="eyebrow">Timeline</span><h4>{ar ? 'رحلة المسابقة' : 'Competition journey'}</h4></div><small>{ar ? 'اختياري' : 'Optional'}</small></div>
      <p className="competition-results-note">{ar ? 'أضيفي المراحل التي حصلت فعلًا، مثل التصفيات، تسليم المشاريع، النهائي، التحكيم، أو إعلان النتائج. لو ما عندها مراحل واضحة اتركي القسم فارغًا.' : 'Add milestones that actually happened, such as qualifiers, project submission, finals, judging, or results. Leave it empty when there is no useful timeline.'}</p>
      <form className="competition-inline-form" onSubmit={addStage}>
        <input name="title" required maxLength={160} placeholder={ar ? 'اسم المرحلة — مثال: التصفيات' : 'Stage — e.g. Qualifiers'} />
        <input name="stage_at" type="datetime-local" />
        <input name="description" placeholder={ar ? 'وصف قصير — اختياري' : 'Short note — optional'} />
        <button className="button" disabled={busy}>{ar ? 'إضافة مرحلة' : 'Add stage'}</button>
      </form>
      {stages.length > 0 && <div className="competition-stage-admin-list">{stages.map((stage, index) => <article key={stage.id}><span>{String(index + 1).padStart(2, '0')}</span><div><strong dir="auto">{stage.title}</strong>{stage.stage_at && <small>{new Intl.DateTimeFormat(ar ? 'ar-SA' : 'en-US', { dateStyle: 'medium', timeStyle: 'short' }).format(new Date(stage.stage_at))}</small>}{stage.description && <p dir="auto">{stage.description}</p>}</div><button className="text-action danger-text" type="button" onClick={() => setStageDeleteTarget(stage)} disabled={busy}>{ar ? 'حذف' : 'Delete'}</button></article>)}</div>}
    </section>

    <section className="competition-admin-section competition-results-admin">
      <div className="competition-admin-section-head"><div><span className="eyebrow">{ar ? 'النتائج والفائزون' : 'Results & winners'}</span><h4>{details.results_published ? (ar ? 'النتائج منشورة' : 'Results are public') : (ar ? 'النتائج ما زالت مسودة' : 'Results are still draft')}</h4></div><button type="button" className={`button ${details.results_published ? '' : 'button-primary'}`} onClick={() => void toggleResults(!details.results_published)} disabled={busy}>{details.results_published ? (ar ? 'إخفاء النتائج' : 'Unpublish results') : (ar ? 'نشر النتائج' : 'Publish results')}</button></div>
      <p className="competition-results-note">{ar ? 'أضيفي الفائزين براحتك. تقدري تعدّلي أي فائز حتى بعد نشر النتائج.' : 'Add winners at your pace. You can edit any winner even after results are published.'}</p>
      <form className="competition-winner-form" onSubmit={addWinner}>
        <div className="admin-event-two"><label><span>{ar ? 'المركز' : 'Rank'}</span><input name="rank" type="number" min="1" max="100" placeholder="1" /></label><label><span>{ar ? 'اسم الجائزة' : 'Award label'}</span><input name="award_title" placeholder={ar ? 'المركز الأول / أفضل فكرة…' : '1st place / Best idea…'} /></label></div>
        <label><span>{ar ? 'اسم الفائز أو الفريق' : 'Winner / team name'}</span><input name="entry_name" required /></label>
        <label><span>{ar ? 'أعضاء الفريق' : 'Team members'}</span><textarea name="members" rows={2} placeholder={ar ? 'كل اسم في سطر — اختياري' : 'One name per line — optional'} /></label>
        <div className="admin-event-two"><label><span>{ar ? 'اسم المشروع' : 'Project title'}</span><input name="project_title" /></label><label><span>{ar ? 'الجائزة' : 'Prize'}</span><input name="prize" /></label></div>
        <label><span>{ar ? 'رابط المشروع — اختياري' : 'Project URL — optional'}</span><input name="project_url" type="url" /></label>
        <button className="button" disabled={busy}>{ar ? 'إضافة الفائز كمسودة' : 'Add winner as draft'}</button>
      </form>
      {orderedWinners.length > 0 && <div className="competition-winner-admin-list">{orderedWinners.map((winner) => <CompetitionWinnerEditor key={winner.id} winner={winner} ar={ar} busy={busy} onSaved={load} onDelete={() => setWinnerDeleteTarget(winner)} />)}</div>}
    </section>

    <CompetitionShowcaseAdmin eventId={event.id} resultsPublished={details.results_published} showcasePublished={Boolean(details.showcase_published)} winners={orderedWinners} />

    <button className="competition-remove-template" type="button" onClick={() => setRemoveTemplate(true)}>{ar ? 'إلغاء قالب المسابقة وإرجاعها فعالية أكاديمية عادية' : 'Remove competition template and return to a regular academic event'}</button>

    <ConfirmDialog open={Boolean(stageDeleteTarget)} title={ar ? 'حذف المرحلة؟' : 'Delete stage?'} description={ar ? `هل أنتِ متأكدة من حذف مرحلة «${stageDeleteTarget?.title ?? ''}» من رحلة المسابقة؟` : `Are you sure you want to delete “${stageDeleteTarget?.title ?? ''}” from the competition journey?`} confirmLabel={ar ? 'نعم، حذف المرحلة' : 'Yes, delete stage'} cancelLabel={ar ? 'إلغاء' : 'Cancel'} tone="danger" busy={busy} onCancel={() => !busy && setStageDeleteTarget(null)} onConfirm={() => void removeStage()} />
    <ConfirmDialog open={Boolean(winnerDeleteTarget)} title={ar ? 'حذف الفائز؟' : 'Delete winner?'} description={ar ? `هل أنتِ متأكدة من حذف «${winnerDeleteTarget?.entry_name ?? ''}» من النتائج؟` : `Are you sure you want to delete “${winnerDeleteTarget?.entry_name ?? ''}” from the results?`} confirmLabel={ar ? 'نعم، حذف الفائز' : 'Yes, delete winner'} cancelLabel={ar ? 'إلغاء' : 'Cancel'} tone="danger" busy={busy} onCancel={() => !busy && setWinnerDeleteTarget(null)} onConfirm={() => void removeWinner()} />
    <ConfirmDialog open={removeTemplate} title={ar ? 'إلغاء قالب المسابقة؟' : 'Remove competition template?'} description={ar ? 'سيتم حذف بيانات المسابقة والمراحل والفائزين ومشاريع المشاركين فقط. بيانات الفعالية وغلافها وألبومها ستظل كما هي.' : 'Competition details, stages, winners, and participant projects will be removed. The event, cover, and album will stay intact.'} confirmLabel={ar ? 'نعم، إلغاء القالب' : 'Yes, remove template'} cancelLabel={ar ? 'الاحتفاظ به' : 'Keep template'} tone="danger" busy={busy} onCancel={() => !busy && setRemoveTemplate(false)} onConfirm={() => void removeCompetitionTemplate()} />
  </div>
}