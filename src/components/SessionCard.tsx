import { Link } from 'react-router-dom'
import type { SearchSession, Session } from '../types/domain'
import { publicStorageUrl } from '../lib/supabase'
import { useUi } from '../hooks/useUi'

export function SessionCard({ session }: { session: Session | SearchSession }) {
  const { locale, t } = useUi()
  const image = publicStorageUrl('session-covers', session.cover_path)
  const category = 'category_name' in session ? session.category_name : session.category?.name
  const speaker = 'speaker_name' in session ? session.speaker_name : session.speaker?.name

  return <article className="session-card session-card-v2">
    <div className="session-cover" style={image ? { backgroundImage: `url(${image})` } : undefined}>{!image && <span>Session</span>}</div>
    <div className="session-card-body">
      <div className="eyebrow">{category || t('sessions.general')}</div>
      <h3>{session.title}</h3>
      <p>{session.description.slice(0, 130)}{session.description.length > 130 ? '…' : ''}</p>
      <div className="session-meta"><span>{speaker || t('sessions.speakerLater')}</span><span>{new Intl.DateTimeFormat(locale, { dateStyle: 'medium', timeStyle: 'short' }).format(new Date(session.starts_at))}</span></div>
      <Link className="button button-primary full" to={`/sessions/${session.id}`}>{t('sessions.details')}</Link>
    </div>
  </article>
}
