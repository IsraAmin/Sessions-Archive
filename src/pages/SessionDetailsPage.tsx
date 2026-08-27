import { useEffect, useState } from 'react'
import { Link, useParams } from 'react-router-dom'
import { supabase, publicStorageUrl } from '../lib/supabase'
import { useAuth } from '../hooks/useAuth'
import type { Session, SessionResource, SessionVideo } from '../types/domain'
import { errorMessage } from '../lib/errors'
import { YouTubePlayer } from '../components/YouTubePlayer'

export function SessionDetailsPage() {
  const { id } = useParams()
  const { user } = useAuth()
  const [session, setSession] = useState<Session | null>(null)
  const [resources, setResources] = useState<SessionResource[]>([])
  const [videos, setVideos] = useState<SessionVideo[]>([])
  const [registered, setRegistered] = useState(false)
  const [bookmarked, setBookmarked] = useState(false)
  const [rating, setRating] = useState(5)
  const [comment, setComment] = useState('')
  const [message, setMessage] = useState('')
  const [busy, setBusy] = useState(false)

  async function load() {
    if (!id) return
    const { data, error } = await supabase
      .from('sessions')
      .select('*, category:categories(*), speaker:speakers(*)')
      .eq('id', id)
      .single()
    if (error) { setMessage(error.message); return }
    setSession(data as Session)

    const [resourceResult, videoResult] = await Promise.all([
      supabase.from('session_resources').select('*').eq('session_id', id).order('created_at'),
      supabase.from('session_videos').select('*').eq('session_id', id).order('position').order('created_at'),
    ])
    setResources((resourceResult.data ?? []) as SessionResource[])
    setVideos((videoResult.data ?? []) as SessionVideo[])

    if (user) {
      const [reg, mark, feedback] = await Promise.all([
        supabase.from('registrations').select('id').eq('session_id', id).eq('user_id', user.id).maybeSingle(),
        supabase.from('bookmarks').select('id').eq('session_id', id).eq('user_id', user.id).maybeSingle(),
        supabase.from('feedback').select('rating, comment').eq('session_id', id).eq('user_id', user.id).maybeSingle(),
      ])
      setRegistered(Boolean(reg.data))
      setBookmarked(Boolean(mark.data))
      if (feedback.data) {
        setRating(feedback.data.rating)
        setComment(feedback.data.comment ?? '')
      }
    }
  }

  useEffect(() => { void load() }, [id, user?.id])

  async function action(task: () => Promise<void>) {
    setBusy(true); setMessage('')
    try { await task(); await load() }
    catch (error) { setMessage(errorMessage(error)) }
    finally { setBusy(false) }
  }

  if (!session) return <div className="page-state">{message || 'جاري تحميل التفاصيل…'}</div>
  const cover = publicStorageUrl('session-covers', session.cover_path)
  const speakerImage = publicStorageUrl('speaker-images', session.speaker?.image_path ?? null)

  return (
    <section className="details-layout">
      <div className="panel details-main">
        {cover && <img className="details-cover" src={cover} alt="" />}
        <div className="eyebrow">{session.category?.name || 'عام'}</div>
        <h1>{session.title}</h1>
        <p className="lead">{session.description}</p>
        {session.speaker && (
          <div className="speaker-summary">
            {speakerImage && <img src={speakerImage} alt={`صورة ${session.speaker.name}`} />}
            <div>
              <span>Speaker</span>
              <strong>{session.speaker.name}</strong>
              {session.speaker.organization && <p>{session.speaker.organization}</p>}
              {session.speaker.bio && <p>{session.speaker.bio}</p>}
            </div>
          </div>
        )}

        <div className="info-grid">
          <div><span>المتحدث</span><strong>{session.speaker?.name || 'يحدد لاحقًا'}</strong></div>
          <div><span>الموعد</span><strong>{new Intl.DateTimeFormat('ar', { dateStyle: 'full', timeStyle: 'short' }).format(new Date(session.starts_at))}</strong></div>
          <div><span>المكان</span><strong>{session.location || 'أونلاين / يحدد لاحقًا'}</strong></div>
          <div><span>السعة</span><strong>{session.capacity}</strong></div>
        </div>

        {videos.length > 0 && (
          <section className="session-recordings" aria-labelledby="recordings-heading">
            <div className="recordings-heading">
              <div>
                <span className="recording-kicker">التسجيل متاح</span>
                <h2 id="recordings-heading">شاهد السيشن هنا</h2>
              </div>
              <span className="recording-count">{videos.length === 1 ? 'فيديو واحد' : `${videos.length} فيديوهات`}</span>
            </div>
            <div className="recording-list">
              {videos.map((video, index) => (
                <article className="recording-item" key={video.id}>
                  <div className="recording-label">
                    <span>{index === 0 ? 'التسجيل الرئيسي' : `الجزء ${index + 1}`}</span>
                    <strong>{video.title}</strong>
                  </div>
                  <YouTubePlayer videoId={video.youtube_video_id} title={`${session.title} — ${video.title}`} />
                </article>
              ))}
            </div>
          </section>
        )}

        {resources.length > 0 && <div className="resource-list"><h2>المصادر</h2>{user ? resources.map((resource) => (
          <button key={resource.id} className="link-button" onClick={async () => {
            const { data, error } = await supabase.storage.from('session-resources').createSignedUrl(resource.file_path, 60)
            if (error) setMessage(error.message)
            else window.open(data.signedUrl, '_blank', 'noopener,noreferrer')
          }}>{resource.title}</button>
        )) : <p>سجل الدخول لفتح ملفات السيشن.</p>}</div>}
      </div>

      <aside className="panel action-panel">
        {!user ? <><p>سجل الدخول للتسجيل والحفظ والتقييم.</p><Link className="button button-primary full" to="/auth">تسجيل الدخول</Link></> : <>
          <button className={`button full ${registered ? 'button-danger' : 'button-primary'}`} disabled={busy} onClick={() => void action(async () => {
            if (registered) {
              const { error } = await supabase.from('registrations').delete().eq('session_id', session.id).eq('user_id', user.id)
              if (error) throw error
            } else {
              const { error } = await supabase.from('registrations').insert({ session_id: session.id, user_id: user.id })
              if (error) throw error
            }
          })}>{registered ? 'إلغاء التسجيل' : 'سجل في السيشن'}</button>

          <button className="button button-secondary full" disabled={busy} onClick={() => void action(async () => {
            if (bookmarked) {
              const { error } = await supabase.from('bookmarks').delete().eq('session_id', session.id).eq('user_id', user.id)
              if (error) throw error
            } else {
              const { error } = await supabase.from('bookmarks').insert({ session_id: session.id, user_id: user.id, note: null })
              if (error) throw error
            }
          })}>{bookmarked ? 'إزالة من المحفوظات' : 'حفظ Bookmark'}</button>

          <div className="feedback-box">
            <h3>تقييمك</h3>
            <label>النجوم<select value={rating} onChange={(e) => setRating(Number(e.target.value))}>{[5,4,3,2,1].map((n) => <option key={n} value={n}>{n}</option>)}</select></label>
            <label>تعليق<textarea value={comment} onChange={(e) => setComment(e.target.value)} rows={4} /></label>
            <button className="button button-primary full" disabled={busy} onClick={() => void action(async () => {
              const { error } = await supabase.from('feedback').upsert({ user_id: user.id, session_id: session.id, rating, comment: comment.trim() || null }, { onConflict: 'user_id,session_id' })
              if (error) throw error
            })}>حفظ التقييم</button>
          </div>
        </>}
        {message && <p className="notice">{message}</p>}
      </aside>
    </section>
  )
}
