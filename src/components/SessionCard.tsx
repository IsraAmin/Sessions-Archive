import { Link } from 'react-router-dom'
import type { SearchSession, Session } from '../types/domain'
import { publicStorageUrl } from '../lib/supabase'
import { useUi } from '../hooks/useUi'
import { StarRating } from './StarRating'

export function SessionCard({ session }: { session: Session | SearchSession }) {
  const { locale, t, language } = useUi()
  const image = publicStorageUrl('session-covers', session.cover_path)
  const category = 'category_name' in session ? session.category_name : session.category?.name
  const speaker = 'speaker_name' in session ? session.speaker_name : session.speaker?.name
  const rating = 'average_rating' in session ? Number(session.average_rating || 0) : 0
  const ratingCount = 'rating_count' in session ? Number(session.rating_count || 0) : 0

  return <article className="session-card session-card-v2">
    <div className="session-cover" style={image ? { backgroundImage: `url(${image})` } : undefined}>{!image && <span>Session</span>}</div>
    <div className="session-card-body">
      <div className="session-card-topline"><div className="eyebrow">{category || t('sessions.general')}</div>{ratingCount > 0 && <div className="session-card-rating" aria-label={`${language === 'ar' ? 'متوسط التقييم' : 'Average rating'} ${rating.toFixed(1)} ${language === 'ar' ? 'من 5' : 'out of 5'}`}><StarRating value={Math.round(rating)} label={language === 'ar' ? 'متوسط التقييم' : 'Average rating'} readOnly /><strong>{rating.toFixed(1)}</strong><small>({ratingCount})</small></div>}</div>
      <h3>{session.title}</h3>
      <p>{session.description.slice(0, 130)}{session.description.length > 130 ? '…' : ''}</p>
      <div className="session-meta"><span>{speaker || t('sessions.speakerLater')}</span><span>{new Intl.DateTimeFormat(locale, { dateStyle: 'medium', timeStyle: 'short' }).format(new Date(session.starts_at))}</span></div>
      <Link className="button button-primary full" to={`/sessions/${session.id}`}>{t('sessions.details')}</Link>
    </div>
  </article>
}