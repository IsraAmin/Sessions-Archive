import { useEffect, useMemo, useState } from 'react'
import { supabase } from '../lib/supabase'
import { useUi } from '../hooks/useUi'
import { useToast } from './ToastProvider'
import { errorMessage } from '../lib/errors'
import './SessionSpeakersManager.css'

type ManagedSession = {
  id: string
  title: string
  speaker_id: string | null
  speaker_ids: string[] | null
}

type ManagedSpeaker = {
  id: string
  name: string
  organization: string | null
}

export function SessionSpeakersManager() {
  const { language, t } = useUi()
  const { showToast } = useToast()
  const ar = language === 'ar'
  const [sessions, setSessions] = useState<ManagedSession[]>([])
  const [speakers, setSpeakers] = useState<ManagedSpeaker[]>([])
  const [sessionId, setSessionId] = useState('')
  const [selected, setSelected] = useState<string[]>([])
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)
  const sessionsTable = supabase.from('sessions') as any

  async function load() {
    setLoading(true)
    try {
      const [sessionResult, speakerResult] = await Promise.all([
        sessionsTable.select('id,title,speaker_id,speaker_ids').order('starts_at', { ascending: false }),
        supabase.from('speakers').select('id,name,organization').order('name'),
      ])
      if (sessionResult.error) throw sessionResult.error
      if (speakerResult.error) throw speakerResult.error
      const nextSessions = (sessionResult.data ?? []) as ManagedSession[]
      setSessions(nextSessions)
      setSpeakers((speakerResult.data ?? []) as ManagedSpeaker[])
      setSessionId(current => current && nextSessions.some(item => item.id === current) ? current : nextSessions[0]?.id ?? '')
    } catch (error) {
      showToast({ kind: 'error', title: t('common.error'), message: errorMessage(error) })
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => { void load() }, [])

  const activeSession = useMemo(() => sessions.find(item => item.id === sessionId) ?? null, [sessions, sessionId])

  useEffect(() => {
    if (!activeSession) { setSelected([]); return }
    const ids = activeSession.speaker_ids?.length
      ? activeSession.speaker_ids
      : activeSession.speaker_id ? [activeSession.speaker_id] : []
    setSelected([...ids])
  }, [activeSession?.id, activeSession?.speaker_id, activeSession?.speaker_ids?.join(',')])

  function toggleSpeaker(speakerId: string) {
    setSelected(current => current.includes(speakerId)
      ? current.filter(id => id !== speakerId)
      : [...current, speakerId])
  }

  async function save() {
    if (!sessionId) return
    setSaving(true)
    try {
      const { error } = await sessionsTable.update({
        speaker_ids: selected,
        speaker_id: selected[0] ?? null,
      }).eq('id', sessionId)
      if (error) throw error
      showToast({
        kind: 'success',
        title: t('common.success'),
        message: ar ? `تم حفظ ${selected.length} متحدث للسيشن.` : `${selected.length} session speaker(s) saved.`,
      })
      await load()
    } catch (error) {
      showToast({ kind: 'error', title: t('common.error'), message: errorMessage(error) })
    } finally {
      setSaving(false)
    }
  }

  return <section className="panel section-gap session-speakers-manager">
    <div className="session-speakers-manager-head">
      <div>
        <span className="eyebrow">{ar ? 'إدارة السيشن' : 'Session management'}</span>
        <h2>{ar ? 'متحدثو السيشن' : 'Session speakers'}</h2>
        <p>{ar ? 'اختاري السيشن ثم حددي متحدثًا واحدًا أو أكثر. يمكنك إضافة أي عدد من المتحدثين للسيشن نفسه.' : 'Choose a session, then select one or more speakers. A session can have any number of speakers.'}</p>
      </div>
      <span className="speaker-selection-count">{selected.length}</span>
    </div>

    <label className="form-field session-speaker-session-select">
      <span className="field-label">{ar ? 'السيشن' : 'Session'}</span>
      <select value={sessionId} onChange={event => setSessionId(event.target.value)} disabled={loading || saving}>
        {!sessions.length && <option value="">{ar ? 'لا توجد سيشنات' : 'No sessions'}</option>}
        {sessions.map(session => <option key={session.id} value={session.id}>{session.title}</option>)}
      </select>
    </label>

    <div className="session-speaker-grid" role="group" aria-label={ar ? 'اختيار متحدثي السيشن' : 'Choose session speakers'}>
      {speakers.map(speaker => {
        const checked = selected.includes(speaker.id)
        return <label className={`session-speaker-option ${checked ? 'is-selected' : ''}`} key={speaker.id}>
          <input type="checkbox" checked={checked} onChange={() => toggleSpeaker(speaker.id)} disabled={saving} />
          <span className="session-speaker-check" aria-hidden="true">✓</span>
          <span className="session-speaker-copy"><strong>{speaker.name}</strong>{speaker.organization && <small>{speaker.organization}</small>}</span>
        </label>
      })}
      {!loading && !speakers.length && <div className="empty-state">{ar ? 'أضيفي المتحدثين أولًا من قسم المتحدثين.' : 'Add speakers first from the Speakers section.'}</div>}
    </div>

    <div className="session-speakers-manager-actions">
      <span>{ar ? `تم تحديد ${selected.length} متحدث` : `${selected.length} selected`}</span>
      <button className="button button-primary" type="button" disabled={!sessionId || saving || loading} onClick={() => void save()}>
        {saving ? (ar ? 'جارٍ الحفظ…' : 'Saving…') : (ar ? 'حفظ متحدثي السيشن' : 'Save session speakers')}
      </button>
    </div>
  </section>
}
