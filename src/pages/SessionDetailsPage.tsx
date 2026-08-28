import { useEffect, useMemo, useState } from 'react'
import { Link, useParams } from 'react-router-dom'
import { supabase, publicStorageUrl } from '../lib/supabase'
import { useAuth } from '../hooks/useAuth'
import { useUi } from '../hooks/useUi'
import type { Session, SessionResource, SessionSeries, SessionVideo, VideoProgress } from '../types/domain'
import { errorMessage } from '../lib/errors'
import { YouTubePlayer } from '../components/YouTubePlayer'
import { useToast } from '../components/ToastProvider'
import { downloadSessionIcs, googleCalendarUrl } from '../lib/calendar'
import { Icon } from '../components/Icon'
import { StarRating } from '../components/StarRating'

type SeriesSession = { id: string; title: string; series_position: number | null }

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
  const [progress, setProgress] = useState<VideoProgress[]>([])
  const [bookmarked, setBookmarked] = useState(false)
  const [rating, setRating] = useState(5)
  const [comment, setComment] = useState('')
  const [message, setMessage] = useState('')
  const [busy, setBusy] = useState(false)

  async function load() {
    if (!id) return
    setMessage('')
    const { data, error } = await supabase.from('sessions').select('*, category:categories(*), speaker:speakers(*), series:session_series(*)').eq('id', id).single()
    if (error) { setMessage(errorMessage(error)); return }
    const current = data as unknown as Session & { series?: SessionSeries | null }
    setSession(current)
    setSeries(current.series ?? null)

    const [resourceResult, videoResult] = await Promise.all([
      supabase.from('session_resources').select('*').eq('session_id', id).order('created_at'),
      supabase.from('session_videos').select('*').eq('session_id', id).order('position').order('created_at'),
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

  const progressByVideo = useMemo(() => new Map(progress.map((row) => [row.video_id, row])), [progress])

  if (!session) return <div className="page-state">{message || t('common.loading')}</div>
  const cover = publicStorageUrl('session-covers', session.cover_path)
  const speakerImage = publicStorageUrl('speaker-images', session.speaker?.image_path ?? null)
  const ar = language === 'ar'

  return <section className="details-layout details-layout-v2">
    <div className="panel details-main">
      {cover && <img className="details-cover" src={cover} alt="" />}
      <div className="eyebrow">{session.category?.name || t('sessions.general')}</div>
      <h1>{session.title}</h1><p className="lead">{session.description}</p>

      {session.speaker && <div className="speaker-summary">
        {speakerImage && <img src={speakerImage} alt={session.speaker.name} />}
        <div><span>{t('details.speaker')}</span><strong>{session.speaker.name}</strong>{session.speaker.organization && <p>{session.speaker.organization}</p>}{session.speaker.bio && <p>{session.speaker.bio}</p>}</div>
      </div>}

      <div className="info-grid">
        <div><span>{t('details.speaker')}</span><strong>{session.speaker?.name || t('sessions.speakerLater')}</strong></div>
        <div><span>{t('details.date')}</span><strong>{new Intl.DateTimeFormat(locale, { dateStyle: 'full', timeStyle: 'short' }).format(new Date(session.starts_at))}</strong></div>
        <div><span>{t('details.location')}</span><strong>{session.location || t('details.online')}</strong></div>
        <div><span>{t('details.capacity')}</span><strong>{session.capacity}</strong></div>
      </div>

      <div className="calendar-actions">
        <a className="button button-secondary" href={googleCalendarUrl(session)} target="_blank" rel="noreferrer"><Icon name="calendar" />{t('details.googleCalendar')}</a>
        <button className="button button-ghost" onClick={() => { downloadSessionIcs(session); showToast({ kind: 'success', title: t('common.success'), message: t('details.calendarToast') }) }}><Icon name="calendar" />{t('details.downloadIcs')}</button>
      </div>

      {series && <section className="series-strip">
        <div><span>{t('details.series')}</span><strong>{series.title}</strong>{series.description && <p>{series.description}</p>}</div>
        <div className="series-parts">{seriesSessions.map((item) => <Link key={item.id} to={`/sessions/${item.id}`} className={item.id === session.id ? 'current' : ''}><small>{item.series_position ? t('details.seriesPart', { n: item.series_position }) : ''}</small><span>{item.title}</span></Link>)}</div>
      </section>}

      {videos.length > 0 && <section className="session-recordings" aria-labelledby="recordings-heading">
        <div className="recordings-heading"><div><span className="recording-kicker">{t('details.recordingAvailable')}</span><h2 id="recordings-heading">{t('details.watchHere')}</h2></div><span className="recording-count">{videos.length === 1 ? t('details.oneVideo') : t('details.videos', { n: videos.length })}</span></div>
        <div className="recording-list">{videos.map((video, index) => {
          const saved = progressByVideo.get(video.id)
          return <article className="recording-item" key={video.id}><div className="recording-label"><span>{index === 0 ? t('details.mainRecording') : t('details.part', { n: index + 1 })}</span><strong>{video.title}</strong></div><YouTubePlayer videoId={video.youtube_video_id} videoDbId={video.id} initialProgress={saved ? { seconds: saved.seconds, percent: saved.percent } : null} title={`${session.title} — ${video.title}`} /></article>
        })}</div>
      </section>}

      {resources.length > 0 && <div className="resource-list"><h2>{t('details.resources')}</h2>{user ? resources.map((resource) => <button key={resource.id} className="link-button" onClick={async () => {
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
