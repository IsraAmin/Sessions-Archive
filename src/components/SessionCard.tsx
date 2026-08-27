import { Link } from 'react-router-dom'
import type { SearchSession, Session } from '../types/domain'
import { publicStorageUrl } from '../lib/supabase'

export function SessionCard({ session }: { session: Session | SearchSession }) {
  const image = publicStorageUrl('session-covers', session.cover_path)
  const category = 'category_name' in session ? session.category_name : session.category?.name
  const speaker = 'speaker_name' in session ? session.speaker_name : session.speaker?.name

  return (
    <article className="session-card">
      <div className="session-cover" style={image ? { backgroundImage: `url(${image})` } : undefined}>
        {!image && <span>Session</span>}
      </div>
      <div className="session-card-body">
        <div className="eyebrow">{category || 'عام'}</div>
        <h3>{session.title}</h3>
        <p>{session.description.slice(0, 130)}{session.description.length > 130 ? '…' : ''}</p>
        <div className="session-meta">
          <span>{speaker || 'متحدث يحدد لاحقًا'}</span>
          <span>{new Intl.DateTimeFormat('ar', { dateStyle: 'medium', timeStyle: 'short' }).format(new Date(session.starts_at))}</span>
        </div>
        <Link className="button button-primary full" to={`/sessions/${session.id}`}>عرض التفاصيل</Link>
      </div>
    </article>
  )
}
