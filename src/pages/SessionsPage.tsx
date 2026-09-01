import { useEffect, useState, type FormEvent } from 'react'
import { useSearchParams } from 'react-router-dom'
import { publicSupabase } from '../lib/supabase'
import { SessionCard } from '../components/SessionCard'
import type { Category, RecordingProvider, SearchSession } from '../types/domain'
import { errorMessage } from '../lib/errors'
import { useUi } from '../hooks/useUi'

function isRecordingProvider(value: string): value is RecordingProvider {
  return ['youtube', 'google_drive', 'whatsapp', 'telegram'].includes(value)
}

export function SessionsPage() {
  const { language, t } = useUi()
  const [searchParams, setSearchParams] = useSearchParams()
  const searchKey = searchParams.toString()
  const [sessions, setSessions] = useState<SearchSession[]>([])
  const [categories, setCategories] = useState<Category[]>([])
  const [query, setQuery] = useState(searchParams.get('search') ?? '')
  const [categoryId, setCategoryId] = useState(searchParams.get('category') ?? '')
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')

  async function load(searchText = query, category = categoryId) {
    setLoading(true)
    setError('')
    try {
      const { data, error: rpcError } = await publicSupabase.rpc('search_sessions', {
        search_text: searchText.trim() || undefined,
        category_filter: category || undefined,
      })
      if (rpcError) throw rpcError

      const baseSessions = (data ?? []) as SearchSession[]
      if (!baseSessions.length) {
        setSessions([])
        return
      }

      const ids = baseSessions.map((session) => session.id)
      const [sessionMetaResult, videoResult] = await Promise.all([
        (publicSupabase.from('sessions') as any).select('id,is_pinned').in('id', ids),
        publicSupabase.from('session_videos').select('session_id,video_provider').in('session_id', ids),
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

      const originalOrder = new Map(baseSessions.map((session, index) => [session.id, index]))
      const enriched = baseSessions.map((session) => ({
        ...session,
        is_pinned: pinBySession.get(session.id) ?? false,
        recording_providers: [...(providersBySession.get(session.id) ?? new Set<RecordingProvider>())],
      }))
      enriched.sort((a, b) => Number(Boolean(b.is_pinned)) - Number(Boolean(a.is_pinned)) || (originalOrder.get(a.id) ?? 0) - (originalOrder.get(b.id) ?? 0))
      setSessions(enriched)
    } catch (err) {
      console.error('Could not load public sessions', err)
      setError(language === 'ar' ? 'تعذر تحميل السيشنات الآن. حاولي التحديث مرة أخرى.' : 'Could not load sessions right now. Please refresh and try again.')
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => {
    void publicSupabase.from('categories').select('*').order('name').then(({ data, error: categoryError }) => {
      if (categoryError) console.error('Could not load categories', errorMessage(categoryError))
      setCategories((data ?? []) as Category[])
    })
  }, [])

  useEffect(() => {
    const nextQuery = searchParams.get('search') ?? ''
    const nextCategory = searchParams.get('category') ?? ''
    setQuery(nextQuery)
    setCategoryId(nextCategory)
    void load(nextQuery, nextCategory)
  }, [searchKey])

  function submit(event: FormEvent) {
    event.preventDefault()
    const next = new URLSearchParams()
    const cleanQuery = query.trim()
    if (cleanQuery) next.set('search', cleanQuery)
    if (categoryId) next.set('category', categoryId)
    if (next.toString() === searchKey) void load(cleanQuery, categoryId)
    else setSearchParams(next)
  }

  return <>
    <section className="hero hero-v2"><div><div className="eyebrow">{t('sessions.eyebrow')}</div><h1>{t('sessions.title')}</h1><p>{t('sessions.subtitle')}</p></div></section>
    <form className="search-panel panel search-panel-v2" onSubmit={submit}>
      <label className="form-field">
        <span className="field-label">{language === 'ar' ? 'البحث عن سيشن' : 'Search sessions'}</span>
        <input placeholder={t('sessions.placeholder')} value={query} onChange={(e) => setQuery(e.target.value)} />
      </label>
      <label className="form-field">
        <span className="field-label">{language === 'ar' ? 'التصنيف' : 'Category'}</span>
        <select value={categoryId} onChange={(e) => setCategoryId(e.target.value)}>
          <option value="">{t('sessions.allCategories')}</option>{categories.map((category) => <option key={category.id} value={category.id}>{category.name}</option>)}
        </select>
      </label>
      <button className="button button-primary">{t('common.search')}</button>
    </form>
    {error && <p className="notice error">{error}</p>}
    {loading ? <div className="page-state">{t('sessions.loading')}</div> : <section className="card-grid">
      {sessions.map((session) => <SessionCard key={session.id} session={session} />)}
      {!sessions.length && !error && <div className="empty-state">{t('sessions.noResults')}</div>}
    </section>}
  </>
}
