import { useEffect, useState } from 'react'
import { Link } from 'react-router-dom'
import { useAuth } from '../hooks/useAuth'
import { supabase } from '../lib/supabase'
import { StatCard } from '../components/StatCard'

type RegistrationRow = {
  id: string
  session_id: string
  session: { id: string; title: string; starts_at: string } | null
}

export function DashboardPage() {
  const { user } = useAuth()
  const [registrations, setRegistrations] = useState<RegistrationRow[]>([])
  const [bookmarks, setBookmarks] = useState(0)
  const [feedback, setFeedback] = useState(0)

  useEffect(() => {
    if (!user) return
    void Promise.all([
      supabase.from('registrations').select('id, session_id, session:sessions(id,title,starts_at)').eq('user_id', user.id).order('created_at', { ascending: false }),
      supabase.from('bookmarks').select('*', { count: 'exact', head: true }).eq('user_id', user.id),
      supabase.from('feedback').select('*', { count: 'exact', head: true }).eq('user_id', user.id),
    ]).then(([regResult, bookmarkResult, feedbackResult]) => {
      setRegistrations((regResult.data ?? []) as unknown as RegistrationRow[])
      setBookmarks(bookmarkResult.count ?? 0)
      setFeedback(feedbackResult.count ?? 0)
    })
  }, [user?.id])

  return (
    <section>
      <div className="section-heading"><div><div className="eyebrow">Dashboard</div><h1>لوحتي</h1></div></div>
      <div className="stats-grid">
        <StatCard label="تسجيلات" value={registrations.length} />
        <StatCard label="Bookmarks" value={bookmarks} />
        <StatCard label="تقييمات" value={feedback} />
      </div>
      <div className="panel">
        <h2>السيشنات المسجل بها</h2>
        <div className="list">
          {registrations.map((registration) => registration.session && (
            <Link key={registration.id} className="list-row" to={`/sessions/${registration.session.id}`}>
              <strong>{registration.session.title}</strong>
              <span>{new Intl.DateTimeFormat('ar', { dateStyle: 'medium', timeStyle: 'short' }).format(new Date(registration.session.starts_at))}</span>
            </Link>
          ))}
          {!registrations.length && <div className="empty-state">لم تسجل في سيشنات بعد.</div>}
        </div>
      </div>
    </section>
  )
}
