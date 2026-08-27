import { useEffect, useState, type FormEvent } from 'react'
import { supabase } from '../lib/supabase'
import { SessionCard } from '../components/SessionCard'
import type { Category, SearchSession } from '../types/domain'
import { errorMessage } from '../lib/errors'
import { useUi } from '../hooks/useUi'

export function SessionsPage() {
  const { language, t } = useUi()
  const [sessions, setSessions] = useState<SearchSession[]>([])
  const [categories, setCategories] = useState<Category[]>([])
  const [query, setQuery] = useState('')
  const [categoryId, setCategoryId] = useState('')
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')

  async function load(searchText = query, category = categoryId) {
    setLoading(true); setError('')
    try {
      const { data, error: rpcError } = await supabase.rpc('search_sessions', { search_text: searchText.trim() || undefined, category_filter: category || undefined })
      if (rpcError) throw rpcError
      setSessions((data ?? []) as SearchSession[])
    } catch (err) { setError(errorMessage(err)) }
    finally { setLoading(false) }
  }

  useEffect(() => {
    void supabase.from('categories').select('*').order('name').then(({ data }) => setCategories((data ?? []) as Category[]))
    void load('', '')
  }, [])

  function submit(event: FormEvent) { event.preventDefault(); void load() }

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
      {!sessions.length && <div className="empty-state">{t('sessions.noResults')}</div>}
    </section>}
  </>
}
