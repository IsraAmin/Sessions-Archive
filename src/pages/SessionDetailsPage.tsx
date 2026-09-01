import { useEffect, useMemo, useState } from 'react'
import { Link, useParams } from 'react-router-dom'
import { supabase, publicStorageUrl } from '../lib/supabase'
import { useAuth } from '../hooks/useAuth'
import { useUi } from '../hooks/useUi'
import type { RecordingProvider, Session, SessionResource, SessionSeries, SessionVideo, Speaker, VideoProgress } from '../types/domain'
import { errorMessage } from '../lib/errors'
import { YouTubePlayer } from '../components/YouTubePlayer'
import { useToast } from '../components/ToastProvider'
import { downloadSessionIcs, googleCalendarUrl } from '../lib/calendar'
import { Icon } from '../components/Icon'
import { StarRating } from '../components/StarRating'

type SeriesSession = { id: string; title: string; series_position: number | null }

function isRecordingProvider(value: string): value is RecordingProvider {
  return ['youtube', 'google_drive', 'whatsapp', 'telegram'].includes(value)
}

function providerLabel(provider: RecordingProvider) {
  if (provider === 'google_drive') return 'Google Drive'
  if (provider === 'whatsapp') return 'WhatsApp'
  if (provider === 'telegram') return 'Telegram'
  return 'YouTube'
}

export function SessionDetailsPage() {
  const { id } = useParams()
  const { user } = useAuth()
  const { locale, t, language } = useUi()
  const { showToast } = useToast()
  const [session, setSession] = useState<Session | null>(null)
  const [series, setSeries] = useState<SessionSeries | null>(null)
  const [seriesSessions, setSeriesSessions] = useState<SeriesSession[]>([])
  const [resources, setResources] = useState<SessionResource[]>([])
  const [videos, setVideos] = useState<SessionVideo[]>([])
  const [selectedVideoPart, setSelectedVideoPart] = useState(1)
  const [progress, setProgress] = useState<VideoProgress[]>([])
  const [bookmarked, setBookmarked] = useState(false)
  const [rating, setRating] = useState(5)
  const [comment, setComment] = useState('')
  const [message, setMessage] = useState('')
  const [busy, setBusy] = useState(false)

  async function load() {
    if (!id) return
    setMessage('')
    const { data, error } = await supabase.from('sessions').select('*, category:categories(*), speaker:speakers!sessions_speaker_id_fkey(*), series:session_series(*)').eq('id', id).single()
    if (error) { setMessage(errorMessage(error)); return }
    const current = data as unknown as Session & { series?: SessionSeries | null }

    const speakerIds = current.speaker_ids?.length ? current.speaker_ids : current.speaker_id ? [current.speaker_id] : []
    if (speakerIds.length) {
      const { data: speakerData, error: speakerError } = await supabase.from('speakers').select('*').in('id', speakerIds)
      if (!speakerError) {
        const speakersById = new Map(((speakerData ?? []) as Speaker[]).map((speaker) => [speaker.id, speaker]))
        current.speakers = speakerIds.flatMap((speakerId) => {
          const speaker = speakersById.get(speakerId)
          return speaker ? [speaker] : []
        })
      }
    }
    if (!current.speakers?.length && current.speaker) current.speakers = [current.speaker]

    setSession(current)
    setSeries(current.series ?? null)

    const [resourceResult, videoResult] = await Promise.all([
      supabase.from('session_resources').select('*').eq('session_id', id).order('created_at'),
      supabase.from('session_videos').select('*').eq('session_id', id).order('part_number').order('position').order('created_at'),
    ])
    const nextVideos = (videoResult.data ?? []) as SessionVideo[]
    setResources((resourceResult.data ?? []) as SessionResource[])
    setVideos(nextVideos)

    if (current.series_id) {
      const { data: siblingData } = await supabase.from('sessions').select('id,title,series_position').eq('series_id', current.series_id).eq('status', 'published').order('series_position')
      setSeriesSessions((siblingData ?? []) as SeriesSession[])
    } else setSeriesSessions([])

    if (user) {
      await supabase.from('session_views').upsert({ user_id: user.id, session_id: id, viewed_at: new Date().toISOString() }, { onConflict: 'user_id,session_id' })
      const [mark, feedback, progressResult] = await Promise.all([
        supabase.from('bookmarks').select('id').eq('session_id', id).eq('user_id', user.id).maybeSingle(),
        supabase.from('feedback').select('rating, comment').eq('session_id', id).eq('user_id', user.id).maybeSingle(),
        nextVideos.length ? supabase.from('video_progress').select('*').eq('user_id', user.id).in('video_id', nextVideos.map((video) => video.id)) : Promise.resolve({ data: [], error: null }),
      ])
      setBookmarked(Boolean(mark.data))
      setProgress((progressResult.data ?? []) as VideoProgress[])
      if (feedback.data) { setRating(feedback.data.rating); setComment(feedback.data.comment ?? '') }
    } else setProgress([])
  }

  useEffect(() => { void load() }, [id, user?.id])

  async function action(task: () => Promise<void>, success: string) {
    setBusy(true)
    try {
      await task()
      await load()
      showToast({ kind: 'success', title: t('common.success'), message: success })
    } catch (error) {
      showToast({ kind: 'error', title: t('common.error'), message: errorMessage(error) })
    } finally { setBusy(false) }
  }

  async function shareSession() {
    if (!session) return
    const ar = language === 'ar'
    const url = window.location.href
    const shareData = {
      title: session.title.replace(/\s+/g, ' ').trim(),
      text: ar ? `شوف السيشن دي في Sessions Archive: ${session.title.replace(/\s+/g, ' ').trim()}` : `Check out this session on Sessions Archive: ${session.title.replace(/\s+/g, ' ').trim()}`,
      url,
    }

    try {
      if (navigator.share) {
        await navigator.share(shareData)
        return
      }
      await navigator.clipboard.writeText(url)
      showToast({ kind: 'success', title: t('common.success'), message: ar ? 'تم نسخ رابط السيشن، جاهز للمشاركة.' : 'Session link copied and ready to share.' })
    } catch (error) {
      if (error instanceof DOMException && error.name === 'AbortError') return
      showToast({ kind: 'error', title: t('common.error'), message: ar ? 'تعذر مشاركة الرابط الآن.' : 'Could not share the link right now.' })
    }
  }

  const progressByVideo = useMemo(() => new Map(progress.map((row) => [row.video_id, row])), [progress])
  const recordingProviders = useMemo(() => {
    const providers = new Set<RecordingProvider>()
    for (const video of videos) {
      const provider = String(video.video_provider)
      if (isRecordingProvider(provider)) providers.add(provider)
    }
    return [...providers]
  }, [videos])

  const videoParts = useMemo(() => {
    const grouped = new Map<number, SessionVideo[]>()
    for (const video of videos) {
      const part = Math.max(1, Number(video.part_number || 1))
      const current = grouped.get(part) ?? []
      current.push(video)
      grouped.set(part, current)
    }
    return [...grouped.entries()]
      .sort(([a], [b]) => a - b)
      .map(([part, items]) => ({ part, videos: [...items].sort((a, b) => a.position - b.position || a.created_at.localeCompare(b.created_at)) }))
  }, [videos])

  useEffect(() => {
    if (!videoParts.length) return
    if (!videoParts.some((entry) => entry.part === selectedVideoPart)) setSelectedVideoPart(videoParts[0].part)
  }, [videoParts, selectedVideoPart])

  const activeVideoPart = videoParts.find((entry) => entry.part === selectedVideoPart) ?? videoParts[0]

  if (!session) return <div className="page-state">{message || t('common.loading')}</div>
  const cover = publicStorageUrl('session-covers', session.cover_path)
  const sessionSpeakers = session.speakers?.length ? session.speakers : session.speaker ? [session.speaker] : []
  const ar = language === 'ar'
  const hasRecording = videos.length > 0

  return <section className="details-layout details-layout-v2">
    <div className="panel details-main">
      {cover && <img className="details-cover" src={cover} alt="" />}
      <div className="details-category-row"><div className="eyebrow">{session.category?.name || t('sessions.general')}</div>{session.is_pinned && <span className="session-detail-pinned-badge">{ar ? 'مثبّت في أول الصفحة' : 'Pinned to top'}</span>}</div>
      <h1 className="session-bidi-text" dir="auto">{session.title}</h1>
      <p className="lead session-bidi-text" dir="auto">{session.description}</p>

      <div className="session-details-utility-row">
        <div className={`session-recording-status session-recording-status-detail ${hasRecording ? 'available' : 'pending'}`}>
          <span className="session-recording-status-dot" aria-hidden="true" />
          <div>
            <strong>{hasRecording ? (ar ? 'التسجيل متاح' : 'Recording available') : (ar ? 'التسجيل غير مضاف بعد' : 'Recording not added yet')}</strong>
            {hasRecording && <span className="session-recording-providers">{recordingProviders.map((provider) => <small key={provider}>{providerLabel(provider)}</small>)}</span>}
          </div>
        </div>
        <button type="button" className="button button-secondary session-share-button" onClick={() => void shareSession()}><Icon name="share" />{ar ? 'مشاركة السيشن' : 'Share session'}</button>
      </div>

      {sessionSpeakers.length > 0 && <div className="speaker-summary-list">
        {sessionSpeakers.map((speaker) => {
          const speakerImage = publicStorageUrl('speaker-images', speaker.image_path)
          return <div className="speaker-summary" key={speaker.id}>
            {speakerImage && <img src={speakerImage} alt={speaker.name} />}
            <div><span>{sessionSpeakers.length > 1 ? (ar ? 'متحدث' : 'Speaker') : t('details.speaker')}</span><strong className="session-bidi-text" dir="auto">{speaker.name}</strong>{speaker.organization && <p className="session-bidi-text" dir="auto">{speaker.organization}</p>}{speaker.bio && <p className="session-bidi-text" dir="auto">{speaker.bio}</p>}</div>
          </div>
        })}
      </div>}

      <div className="info-grid">
        <div><span>{sessionSpeakers.length > 1 ? (ar ? 'المتحدثون' : 'Speakers') : t('details.speaker')}</span><strong className="session-bidi-text" dir="auto">{sessionSpeakers.length ? sessionSpeakers.map((speaker) => speaker.name).join('، ') : t('sessions.speakerLater')}</strong></div>
        <div><span>{t('details.date')}</span><strong>{new Intl.DateTimeFormat(locale, { dateStyle: 'full', timeStyle: 'short' }).format(new Date(session.starts_at))}</strong></div>
        <div><span>{t('details.location')}</span><strong className="session-bidi-text" dir="auto">{session.location || t('details.online')}</strong></div>
        <div><span>{t('details.capacity')}</span><strong>{session.capacity}</strong></div>
      </div>

      <div className="calendar-actions">
        <a className="button button-secondary" href={googleCalendarUrl(session)} target="_blank" rel="noreferrer"><Icon name="calendar" />{t('details.googleCalendar')}</a>
        <button className="button button-ghost" onClick={() => { downloadSessionIcs(session); showToast({ kind: 'success', title: t('common.success'), message: t('details.calendarToast') }) }}><Icon name="calendar" />{t('details.downloadIcs')}</button>
      </div>

      {series && <section className="series-strip">
        <div><span>{t('details.series')}</span><strong className="session-bidi-text" dir="auto">{series.title}</strong>{series.description && <p className="session-bidi-text" dir="auto">{series.description}</p>}</div>
        <div className="series-parts">{seriesSessions.map((item) => <Link key={item.id} to={`/sessions/${item.id}`} className={item.id === session.id ? 'current' : ''}><small>{item.series_position ? t('details.seriesPart', { n: item.series_position }) : ''}</small><span className="session-bidi-text" dir="auto">{item.title}</span></Link>)}</div>
      </section>}

      {videos.length > 0 && activeVideoPart && <section className="session-recordings session-recordings-parts" aria-labelledby="recordings-heading">
        <div className="recordings-heading"><div><span className="recording-kicker">{t('details.recordingAvailable')}</span><h2 id="recordings-heading">{t('details.watchHere')}</h2></div><span className="recording-count">{videos.length === 1 ? (ar ? 'تسجيل واحد' : '1 recording') : (ar ? `${videos.length} تسجيلات` : `${videos.length} recordings`)}</span></div>

        <div className="recording-parts-toolbar">
          <div className="recording-part-current">
            <span>{ar ? 'الجزء الحالي' : 'Current part'}</span>
            <strong>Part {activeVideoPart.part}</strong>
            <small>{activeVideoPart.videos.length} {ar ? (activeVideoPart.videos.length === 1 ? 'تسجيل' : 'تسجيلات') : (activeVideoPart.videos.length === 1 ? 'recording' : 'recordings')}</small>
          </div>
          {videoParts.length > 1 ? <label className="recording-part-select">
            <span>{ar ? 'اختاري الجزء' : 'Choose part'}</span>
            <select value={activeVideoPart.part} onChange={(event) => setSelectedVideoPart(Number(event.target.value))}>
              {videoParts.map((entry) => <option key={entry.part} value={entry.part}>Part {entry.part} — {entry.videos.length} {ar ? (entry.videos.length === 1 ? 'تسجيل' : 'تسجيلات') : entry.videos.length === 1 ? 'recording' : 'recordings'}</option>)}
            </select>
          </label> : <span className="recording-single-part">Part {activeVideoPart.part}</span>}
        </div>

        <div className="recording-list recording-part-list">{activeVideoPart.videos.map((video, index) => {
          const saved = progressByVideo.get(video.id)
          return <article className="recording-item" key={video.id}><div className="recording-label"><span>{ar ? `التسجيل ${index + 1}` : `Recording ${index + 1}`}</span><strong className="session-bidi-text" dir="auto">{video.title}</strong></div><YouTubePlayer videoId={video.youtube_video_id} videoDbId={video.id} initialProgress={saved ? { seconds: saved.seconds, percent: saved.percent } : null} title={`${session.title} — Part ${activeVideoPart.part} — ${video.title}`} /></article>
        })}</div>
      </section>}

      {resources.length > 0 && <div className="resource-list"><h2>{t('details.resources')}</h2>{user ? resources.map((resource) => <button key={resource.id} className="link-button session-bidi-text" dir="auto" onClick={async () => {
        const { data, error } = await supabase.storage.from('session-resources').createSignedUrl(resource.file_path, 60)
        if (error) showToast({ kind: 'error', title: t('common.error'), message: errorMessage(error) })
        else window.open(data.signedUrl, '_blank', 'noopener,noreferrer')
      }}>{resource.title}</button>) : <p>{t('details.resourceLogin')}</p>}</div>}
    </div>

    <aside className="panel action-panel action-panel-v2">
      {!user ? <><p>{ar ? 'سجّلي الدخول لحفظ السيشن وإضافة تقييم أو تعليق.' : 'Sign in to save this session and leave a rating or comment.'}</p><Link className="button button-primary full" to="/auth">{t('common.signIn')}</Link></> : <>
        <button className="button button-secondary full" disabled={busy} onClick={() => void action(async () => {
          if (bookmarked) { const { error } = await supabase.from('bookmarks').delete().eq('session_id', session.id).eq('user_id', user.id); if (error) throw error }
          else { const { error } = await supabase.from('bookmarks').insert({ session_id: session.id, user_id: user.id, note: null }); if (error) throw error }
        }, bookmarked ? t('details.unsavedToast') : t('details.savedToast'))}>{bookmarked ? t('details.unbookmark') : t('details.bookmark')}</button>

        <button type="button" className="button button-ghost full" onClick={() => void shareSession()}><Icon name="share" />{ar ? 'مشاركة السيشن' : 'Share session'}</button>

        <div className="feedback-box">
          <h3>{t('details.rating')}</h3>
          <label className="form-field"><span className="field-label">{t('details.stars')}</span><StarRating value={rating} onChange={setRating} label={t('details.stars')} disabled={busy} /></label>
          <label className="form-field"><span className="field-label">{t('details.comment')}</span><textarea value={comment} onChange={(e) => setComment(e.target.value)} rows={4} /></label>
          <button className="button button-primary full" disabled={busy} onClick={() => void action(async () => {
            const { error } = await supabase.from('feedback').upsert({ user_id: user.id, session_id: session.id, rating, comment: comment.trim() || null }, { onConflict: 'user_id,session_id' })
            if (error) throw error
          }, t('details.feedbackToast'))}>{t('details.saveRating')}</button>
        </div>
      </>}
    </aside>
  </section>
}
