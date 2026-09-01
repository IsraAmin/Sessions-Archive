import { useEffect, useState } from 'react'
import { Link } from 'react-router-dom'
import { SessionCard } from '../components/SessionCard'
import { useAuth } from '../hooks/useAuth'
import { useUi } from '../hooks/useUi'
import { errorMessage } from '../lib/errors'
import { supabase } from '../lib/supabase'
import type { RecordingProvider, SearchSession } from '../types/domain'

type BookmarkRow = { session_id: string; created_at: string }

function isRecordingProvider(value: string): value is RecordingProvider {
  return ['youtube', 'google_drive', 'whatsapp', 'telegram'].includes(value)
}

export function SavedSessionsPage() {
  const { user } = useAuth()
  const { language } = useUi()
  const [sessions, setSessions] = useState<SearchSession[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')
  const ar = language === 'ar'

  useEffect(() => {
    if (!user) return
    setLoading(true)
    setError('')

    void (async () => {
      try {
        const [bookmarkResult, sessionResult] = await Promise.all([
          supabase.from('bookmarks').select('session_id,created_at').eq('user_id', user.id).order('created_at', { ascending: false }),
          supabase.rpc('search_sessions', { search_text: undefined, category_filter: undefined }),
        ])
        const firstError = bookmarkResult.error || sessionResult.error
        if (firstError) throw firstError

        const bookmarks = (bookmarkResult.data ?? []) as BookmarkRow[]
        const order = new Map(bookmarks.map((bookmark, index) => [bookmark.session_id, index]))
        const saved = ((sessionResult.data ?? []) as SearchSession[])
          .filter((session) => order.has(session.id))
          .sort((a, b) => (order.get(a.id) ?? 0) - (order.get(b.id) ?? 0))

        if (!saved.length) {
          setSessions([])
          return
        }

        const ids = saved.map((session) => session.id)
        const [sessionMetaResult, videoResult] = await Promise.all([
          (supabase.from('sessions') as any).select('id,is_pinned').in('id', ids),
          supabase.from('session_videos').select('session_id,video_provider').in('session_id', ids),
        ])
        if (sessionMetaResult.error) throw sessionMetaResult.error
        if (videoResult.error) throw videoResult.error

        const pinBySession = new Map<string, boolean>((sessionMetaResult.data ?? []).map((row: { id: string; is_pinned: boolean }) => [row.id, Boolean(row.is_pinned)]))
        const providersBySession = new Map<string, Set<RecordingProvider>>()
        for (const row of videoResult.data ?? []) {
          const provider = String(row.video_provider)
          if (!isRecordingProvider(provider)) continue
          const current = providersBySession.get(row.session_id) ?? new Set<RecordingProvider>()
          current.add(provider)
          providersBySession.set(row.session_id, current)
        }

        setSessions(saved.map((session) => ({
          ...session,
          is_pinned: pinBySession.get(session.id) ?? false,
          recording_providers: [...(providersBySession.get(session.id) ?? new Set<RecordingProvider>())],
        })))
      } catch (reason) {
        setError(errorMessage(reason))
        setSessions([])
      } finally {
        setLoading(false)
      }
    })()
  }, [user?.id])

  return <section>
    <div className="section-heading">
      <div>
        <div className="eyebrow">{ar ? 'مكتبتك' : 'Your library'}</div>
        <h1>{ar ? 'السيشنات المحفوظة' : 'Saved sessions'}</h1>
        <p>{ar ? 'كل السيشنات التي حفظتها موجودة هنا للرجوع إليها بسرعة.' : 'Everything you saved is kept here for quick access.'}</p>
      </div>
      <Link className="button button-secondary" to="/">{ar ? 'استكشف السيشنات' : 'Explore sessions'}</Link>
    </div>

    {error && <p className="notice error" role="alert">{error}</p>}
    {loading ? <div className="page-state">{ar ? 'جاري تحميل المحفوظات…' : 'Loading saved sessions…'}</div> : <section className="card-grid">
      {sessions.map((session) => <SessionCard key={session.id} session={session} />)}
      {!sessions.length && !error && <div className="empty-state">{ar ? 'ما حفظت أي سيشن لسه. افتح أي سيشن واضغط حفظ، وستظهر هنا.' : 'You have not saved a session yet. Save one from its details page and it will appear here.'}</div>}
    </section>}
  </section>
}
