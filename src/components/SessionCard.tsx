import { Link } from 'react-router-dom'
import type { RecordingProvider, SearchSession, Session } from '../types/domain'
import { publicStorageUrl } from '../lib/supabase'
import { useUi } from '../hooks/useUi'
import { StarRating } from './StarRating'

function providerLabel(provider: RecordingProvider) {
  if (provider === 'google_drive') return 'Google Drive'
  if (provider === 'whatsapp') return 'WhatsApp'
  if (provider === 'telegram') return 'Telegram'
  return 'YouTube'
}

export function SessionCard({ session }: { session: Session | SearchSession }) {
  const { locale, t, language } = useUi()
  const image = publicStorageUrl('session-covers', session.cover_path)
  const category = 'category_name' in session ? session.category_name : session.category?.name
  const speaker = 'speaker_name' in session ? session.speaker_name : session.speaker?.name
  const rating = 'average_rating' in session ? Number(session.average_rating || 0) : 0
  const ratingCount = 'rating_count' in session ? Number(session.rating_count || 0) : 0
  const recordingProviders = 'recording_providers' in session ? (session.recording_providers ?? []) : []
  const hasRecording = recordingProviders.length > 0
  const coverFocusX = Number.isFinite(Number(session.cover_focus_x)) ? Number(session.cover_focus_x) : 50
  const coverFocusY = Number.isFinite(Number(session.cover_focus_y)) ? Number(session.cover_focus_y) : 50
  const ar = language === 'ar'

  return <article className={`session-card session-card-v2${session.is_pinned ? ' session-card-pinned' : ''}`}>
    <div className="session-cover" style={image ? { backgroundImage: `url(${image})`, backgroundPosition: `${coverFocusX}% ${coverFocusY}%` } : undefined}>
      {!image && <span>Session</span>}
      {session.is_pinned && <span className="session-pinned-badge">{ar ? 'مثبّت' : 'Pinned'}</span>}
    </div>
    <div className="session-card-body">
      <div className="session-card-topline"><div className="eyebrow">{category || t('sessions.general')}</div>{ratingCount > 0 && <div className="session-card-rating" aria-label={`${ar ? 'متوسط التقييم' : 'Average rating'} ${rating.toFixed(1)} ${ar ? 'من 5' : 'out of 5'}`}><StarRating value={Math.round(rating)} label={ar ? 'متوسط التقييم' : 'Average rating'} readOnly /><strong>{rating.toFixed(1)}</strong></div>}</div>
      <h3 className="session-bidi-text" dir="auto">{session.title}</h3>
      <p className="session-bidi-text" dir="auto">{session.description.slice(0, 130)}{session.description.length > 130 ? '…' : ''}</p>

      <div className={`session-recording-status ${hasRecording ? 'available' : 'pending'}`}>
        <span className="session-recording-status-dot" aria-hidden="true" />
        <div>
          <strong>{hasRecording ? (ar ? 'التسجيل متاح' : 'Recording available') : (ar ? 'التسجيل غير مضاف بعد' : 'Recording not added yet')}</strong>
          {hasRecording && <span className="session-recording-providers">{recordingProviders.map((provider) => <small key={provider}>{providerLabel(provider)}</small>)}</span>}
        </div>
      </div>

      <div className="session-meta"><span className="session-bidi-text" dir="auto">{speaker || t('sessions.speakerLater')}</span><span>{new Intl.DateTimeFormat(locale, { dateStyle: 'medium', timeStyle: 'short' }).format(new Date(session.starts_at))}</span></div>
      <Link className="button button-primary full" to={`/sessions/${session.id}`}>{t('sessions.details')}</Link>
    </div>
  </article>
}
