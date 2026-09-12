import { useEffect, useMemo, useState } from 'react'
import { competitionAttendanceLabel, competitionKindLabel, competitionParticipationLabel, competitionPublicStatus, competitionRegistrationOpen } from '../lib/competition'
import { publicSupabase } from '../lib/supabase'
import type { CollegeEvent, CompetitionDetails, CompetitionStage, CompetitionWinner } from '../types/domain'
import { Icon } from './Icon'

function lines(value: string | null) {
  return (value ?? '').split(/\r?\n/).map((item) => item.trim()).filter(Boolean)
}

function phaseProgress(details: CompetitionDetails) {
  if (details.results_published) return 3
  if (details.phase === 'judging' || details.phase === 'completed') return 2
  if (details.phase === 'in_progress') return 1
  return 0
}

export function CompetitionEventSections({ event, ar }: { event: CollegeEvent; ar: boolean }) {
  const [details, setDetails] = useState<CompetitionDetails | null>(null)
  const [stages, setStages] = useState<CompetitionStage[]>([])
  const [winners, setWinners] = useState<CompetitionWinner[]>([])
  const [loaded, setLoaded] = useState(false)

  useEffect(() => {
    let active = true
    async function load() {
      try {
        const detailsResult = await publicSupabase.from('competition_details').select('*').eq('event_id', event.id).maybeSingle()
        if (detailsResult.error) throw detailsResult.error
        const nextDetails = (detailsResult.data as CompetitionDetails | null) ?? null
        if (!nextDetails) {
          if (active) setDetails(null)
          return
        }
        const [stagesResult, winnersResult] = await Promise.all([
          publicSupabase.from('competition_stages').select('*').eq('event_id', event.id).order('position').order('stage_at'),
          publicSupabase.from('competition_winners').select('*').eq('event_id', event.id).order('position').order('rank'),
        ])
        if (stagesResult.error) throw stagesResult.error
        if (winnersResult.error) throw winnersResult.error
        if (active) {
          setDetails(nextDetails)
          setStages((stagesResult.data ?? []) as CompetitionStage[])
          setWinners((winnersResult.data ?? []) as CompetitionWinner[])
        }
      } catch (error) {
        console.error('Could not load competition details', error)
      } finally {
        if (active) setLoaded(true)
      }
    }
    void load()
    return () => { active = false }
  }, [event.id])

  const orderedWinners = useMemo(() => [...winners].sort((a, b) => (a.rank ?? 999) - (b.rank ?? 999) || a.position - b.position), [winners])
  if (!loaded || !details) return null

  const locale = ar ? 'ar-SA' : 'en-US'
  const dateTime = (value: string | null) => value ? new Intl.DateTimeFormat(locale, { dateStyle: 'medium', timeStyle: 'short' }).format(new Date(value)) : null
  const registrationOpen = competitionRegistrationOpen(details)
  const progress = phaseProgress(details)
  const participation = details.participation_mode === 'individual'
    ? competitionParticipationLabel(details.participation_mode, ar)
    : `${competitionParticipationLabel(details.participation_mode, ar)}${details.min_team_size || details.max_team_size ? ` ${details.min_team_size ?? 1}–${details.max_team_size ?? '+'}` : ''}`
  const prizes = lines(details.prizes)
  const tracks = lines(details.tracks)
  const steps = ar ? ['التسجيل', 'المسابقة', 'التحكيم', 'النتائج'] : ['Registration', 'Competition', 'Judging', 'Results']

  return <div className="competition-public-experience">
    <section className="competition-status-shell">
      <div className="competition-status-main">
        <div className="competition-status-copy">
          <span className="competition-kind-badge">🏆 {competitionKindLabel(details.competition_kind, ar)}</span>
          <strong>{competitionPublicStatus(details, ar)}</strong>
          <small>{registrationOpen && details.registration_closes_at ? (ar ? `التسجيل متاح حتى ${dateTime(details.registration_closes_at)}` : `Registration open until ${dateTime(details.registration_closes_at)}`) : details.competition_starts_at ? (ar ? `موعد المسابقة: ${dateTime(details.competition_starts_at)}` : `Competition starts: ${dateTime(details.competition_starts_at)}`) : (ar ? 'تابع الصفحة لمعرفة آخر التحديثات.' : 'Follow this page for the latest updates.')}</small>
        </div>
        {registrationOpen && details.registration_url ? <a className="button button-primary competition-register-cta" href={details.registration_url} target="_blank" rel="noopener noreferrer">{ar ? 'سجّل الآن' : 'Register now'} <span aria-hidden="true">↗</span></a> : <span className="competition-cta-state">{competitionPublicStatus(details, ar)}</span>}
      </div>

      <div className="competition-phase-track" aria-label={ar ? 'مراحل المسابقة' : 'Competition phases'}>
        {steps.map((step, index) => <div key={step} className={`competition-phase-step ${index < progress ? 'done' : ''} ${index === progress ? 'active' : ''}`}><span>{index < progress ? '✓' : index + 1}</span><strong>{step}</strong></div>)}
      </div>

      <div className="competition-facts-grid">
        <div><span>{ar ? 'المشاركة' : 'Participation'}</span><strong>{participation}</strong></div>
        <div><span>{ar ? 'النمط' : 'Format'}</span><strong>{competitionAttendanceLabel(details.attendance_mode, ar)}</strong></div>
        <div><span>{ar ? 'إغلاق التسجيل' : 'Registration closes'}</span><strong>{dateTime(details.registration_closes_at) || (ar ? 'يُعلن لاحقًا' : 'TBA')}</strong></div>
        <div><span>{ar ? 'الجهة المنظمة' : 'Organizer'}</span><strong dir="auto">{details.organizer || (ar ? 'غير مضافة' : 'Not added')}</strong></div>
      </div>
    </section>

    {(details.eligibility || prizes.length || tracks.length) && <section className="competition-public-section">
      <div className="competition-section-heading"><span>{ar ? 'قبل المشاركة' : 'Before you join'}</span><h2>{ar ? 'تفاصيل المسابقة' : 'Competition details'}</h2></div>
      <div className="competition-info-layout">
        {details.eligibility && <article><span className="competition-info-index">01</span><div><strong>{ar ? 'من يقدر يشارك؟' : 'Who can participate?'}</strong><p dir="auto">{details.eligibility}</p></div></article>}
        {prizes.length > 0 && <article><span className="competition-info-index">02</span><div><strong>{ar ? 'الجوائز' : 'Prizes'}</strong><ul>{prizes.map((prize) => <li key={prize} dir="auto">{prize}</li>)}</ul></div></article>}
        {tracks.length > 0 && <article><span className="competition-info-index">03</span><div><strong>{ar ? 'المجالات / Tracks' : 'Tracks'}</strong><div className="competition-track-list">{tracks.map((track) => <span key={track} dir="auto">{track}</span>)}</div></div></article>}
      </div>
    </section>}

    {stages.length > 0 && <section className="competition-public-section">
      <div className="competition-section-heading"><span>Timeline</span><h2>{ar ? 'رحلة المسابقة' : 'Competition journey'}</h2></div>
      <div className="competition-public-timeline">{stages.map((stage, index) => <article key={stage.id}><span className="competition-timeline-number">{String(index + 1).padStart(2, '0')}</span><div><time>{dateTime(stage.stage_at) || (ar ? 'الموعد يحدد لاحقًا' : 'Date TBA')}</time><h3 dir="auto">{stage.title}</h3>{stage.description && <p dir="auto">{stage.description}</p>}</div></article>)}</div>
    </section>}

    {details.results_published && orderedWinners.length > 0 && <section className="competition-public-section competition-winners-section">
      <div className="competition-section-heading"><span>{ar ? 'النتائج الرسمية' : 'Official results'}</span><h2>🏆 {ar ? 'الفائزون' : 'Winners'}</h2><p>{ar ? 'النتائج المنشورة والمعتمدة لهذه المسابقة.' : 'Published and approved results for this competition.'}</p></div>
      <div className="competition-winners-list">{orderedWinners.map((winner, index) => <article key={winner.id} className={index === 0 ? 'first' : ''}>
        <div className="competition-winner-rank">{winner.rank ? `#${winner.rank}` : '★'}</div>
        <div className="competition-winner-copy"><span>{winner.award_title || (winner.rank ? (ar ? `المركز ${winner.rank}` : `Rank ${winner.rank}`) : (ar ? 'فائز' : 'Winner'))}</span><h3 dir="auto">{winner.entry_name}</h3>{winner.project_title && <strong dir="auto">{winner.project_title}</strong>}{winner.members && <p dir="auto">{winner.members}</p>}{winner.prize && <small dir="auto">{ar ? 'الجائزة: ' : 'Prize: '}{winner.prize}</small>}</div>
        {winner.project_url && <a className="competition-winner-link" href={winner.project_url} target="_blank" rel="noopener noreferrer" aria-label={ar ? 'فتح المشروع' : 'Open project'}><Icon name="share" /></a>}
      </article>)}</div>
    </section>}
  </div>
}
