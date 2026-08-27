import { useEffect, useState, type FormEvent } from 'react'
import { supabase } from '../lib/supabase'
import { SessionCard } from '../components/SessionCard'
import type { Category, SearchSession } from '../types/domain'
import { errorMessage } from '../lib/errors'

export function SessionsPage() {
  const [sessions, setSessions] = useState<SearchSession[]>([])
  const [categories, setCategories] = useState<Category[]>([])
  const [query, setQuery] = useState('')
  const [categoryId, setCategoryId] = useState('')
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')

  async function load(searchText = query, category = categoryId) {
    setLoading(true)
    setError('')
    try {
      const { data, error: rpcError } = await supabase.rpc('search_sessions', {
        search_text: searchText.trim() || null,
        category_filter: category || null,
      })
      if (rpcError) throw rpcError
      setSessions((data ?? []) as SearchSession[])
    } catch (err) {
      setError(errorMessage(err))
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => {
    void supabase.from('categories').select('*').order('name').then(({ data }) => setCategories((data ?? []) as Category[]))
    void load('', '')
  }, [])

  function submit(event: FormEvent) {
    event.preventDefault()
    void load()
  }

  return (
    <>
      <section className="hero">
        <div>
          <div className="eyebrow">تعلم • شارك • تطور</div>
          <h1>اكتشف السيشن المناسبة لك</h1>
          <p>ابحث بالعنوان أو الوصف أو التصنيف أو اسم المتحدث، وسجّل مباشرة من المنصة.</p>
        </div>
      </section>

      <form className="search-panel panel" onSubmit={submit}>
        <input aria-label="بحث" placeholder="ابحث عن Session أو Speaker…" value={query} onChange={(e) => setQuery(e.target.value)} />
        <select aria-label="التصنيف" value={categoryId} onChange={(e) => setCategoryId(e.target.value)}>
          <option value="">كل التصنيفات</option>
          {categories.map((category) => <option key={category.id} value={category.id}>{category.name}</option>)}
        </select>
        <button className="button button-primary">بحث</button>
      </form>

      {error && <p className="notice error">{error}</p>}
      {loading ? <div className="page-state">جاري تحميل السيشنات…</div> : (
        <section className="card-grid">
          {sessions.map((session) => <SessionCard key={session.id} session={session} />)}
          {!sessions.length && <div className="empty-state">لا توجد نتائج مطابقة.</div>}
        </section>
      )}
    </>
  )
}
