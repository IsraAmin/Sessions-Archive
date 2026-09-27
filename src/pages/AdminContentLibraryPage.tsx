import { useEffect, useMemo, useState } from 'react'
import { useSearchParams } from 'react-router-dom'
import { AdminEventsPanel } from '../components/AdminEventsPanel'
import { AdminCompetitionsWorkspace } from '../components/AdminCompetitionsWorkspace'
import { supabase } from '../lib/supabase'
import type { Category, Session, SessionSeries, SessionVideo, Speaker } from '../types/domain'
import type { Database } from '../types/database'

type SessionUpdate = Database['public']['Tables']['sessions']['Update']
import { useUi } from '../hooks/useUi'
import { useToast } from '../components/ToastProvider'
import { errorMessage } from '../lib/errors'
import { AdminEditorDialog, type EditTarget } from '../components/AdminEditorDialog'
import { ConfirmDialog } from '../components/ConfirmDialog'
import { Icon } from '../components/Icon'

type LibraryType = 'sessions' | 'speakers' | 'categories' | 'series' | 'videos'
type HubArea = 'sessions' | 'events'
type Confirmation = { title: string; description: string; action: () => Promise<void> } | null

export function AdminContentLibraryPage() {
  const { language, locale, t } = useUi()
  const { showToast } = useToast()
  const ar = language === 'ar'
  const [params, setParams] = useSearchParams()
  const requested = params.get('type') as LibraryType | null
  const requestedArea = params.get('area') as HubArea | null
  const [area, setArea] = useState<HubArea>(requestedArea && ['sessions','events'].includes(requestedArea) ? requestedArea : 'sessions')
  const [type, setType] = useState<LibraryType>(requested && ['sessions','speakers','categories','series','videos'].includes(requested) ? requested : 'sessions')
  const [query, setQuery] = useState('')
  const [categories, setCategories] = useState<Category[]>([])
  const [speakers, setSpeakers] = useState<Speaker[]>([])
  const [sessions, setSessions] = useState<Session[]>([])
  const [series, setSeries] = useState<SessionSeries[]>([])
  const [videos, setVideos] = useState<SessionVideo[]>([])
  const [editing, setEditing] = useState<EditTarget | null>(null)
  const [editorBusy, setEditorBusy] = useState(false)
  const [confirmation, setConfirmation] = useState<Confirmation>(null)
  const [confirmBusy, setConfirmBusy] = useState(false)
  const fail = (error: unknown) => showToast({ kind: 'error', title: t('common.error'), message: errorMessage(error) })
  const success = (message: string) => showToast({ kind: 'success', title: t('common.success'), message })

  async function load() {
    const [cat, spk, ses, ser, vid] = await Promise.all([
      supabase.from('categories').select('*').order('name'), supabase.from('speakers').select('*').order('name'),
      supabase.from('sessions').select('*').order('starts_at', { ascending: false }), supabase.from('session_series').select('*').order('created_at', { ascending: false }),
      supabase.from('session_videos').select('*').order('session_id').order('part_number').order('position'),
    ])
    const error = cat.error || spk.error || ses.error || ser.error || vid.error
    if (error) throw error
    setCategories((cat.data ?? []) as Category[]); setSpeakers((spk.data ?? []) as Speaker[]); setSessions((ses.data ?? []) as Session[]); setSeries((ser.data ?? []) as SessionSeries[]); setVideos((vid.data ?? []) as SessionVideo[])
  }
  useEffect(() => { void load().catch(fail) }, [])
  function choose(next: LibraryType) { setType(next); setQuery(''); setParams({ area: area, type: next }, { replace: true }) }
  function chooseArea(next: HubArea) { setArea(next); setQuery(''); if (next === 'sessions') { setType('sessions'); setParams({area:'sessions',type:'sessions'},{replace:true}) } else setParams({area:'events'},{replace:true}) }
  const q = query.trim().toLowerCase()
  const rows = useMemo(() => {
    if (type === 'sessions') return sessions.filter(x => !q || [x.title,x.description,x.location,x.status].some(v => String(v ?? '').toLowerCase().includes(q))).map(x => ({ id:x.id, title:x.title, meta:new Intl.DateTimeFormat(locale,{dateStyle:'medium'}).format(new Date(x.starts_at)), target:{type:'session',item:x} as EditTarget }))
    if (type === 'speakers') return speakers.filter(x => !q || [x.name,x.organization,x.bio].some(v => String(v ?? '').toLowerCase().includes(q))).map(x => ({ id:x.id,title:x.name,meta:x.organization || '—',target:{type:'speaker',item:x} as EditTarget }))
    if (type === 'categories') return categories.filter(x => !q || [x.name,x.slug,x.description].some(v => String(v ?? '').toLowerCase().includes(q))).map(x => ({ id:x.id,title:x.name,meta:x.slug,target:{type:'category',item:x} as EditTarget }))
    if (type === 'series') return series.filter(x => !q || [x.title,x.description].some(v => String(v ?? '').toLowerCase().includes(q))).map(x => ({ id:x.id,title:x.title,meta:x.description || '—',target:{type:'series',item:x} as EditTarget }))
    return videos.filter(x => !q || [x.title,sessions.find(s=>s.id===x.session_id)?.title].some(v => String(v ?? '').toLowerCase().includes(q))).map(x => ({ id:x.id,title:x.title,meta:`Part ${x.part_number ?? 1} · ${sessions.find(s=>s.id===x.session_id)?.title || '—'}`,target:{type:'video',item:x} as EditTarget }))
  }, [type,q,sessions,speakers,categories,series,videos,locale])

  async function saveEdit(target: EditTarget, values: Record<string, unknown>) {
    setEditorBusy(true)
    try {
      let result
      if (target.type === 'category') result = await supabase.from('categories').update(values as Partial<Category>).eq('id', target.item.id)
      else if (target.type === 'speaker') result = await supabase.from('speakers').update(values as Partial<Speaker>).eq('id', target.item.id)
      else if (target.type === 'series') result = await supabase.from('session_series').update(values as Partial<SessionSeries>).eq('id', target.item.id)
      else if (target.type === 'session') result = await supabase.from('sessions').update(values as SessionUpdate).eq('id', target.item.id)
      else result = await supabase.from('session_videos').update(values as Partial<SessionVideo>).eq('id', target.item.id)
      if (result.error) throw result.error
      success(ar ? 'تم حفظ التغييرات.' : 'Changes saved.'); setEditing(null); await load()
    } catch (error) { fail(error); throw error } finally { setEditorBusy(false) }
  }
  async function remove(target: EditTarget) {
    let result
    if (target.type === 'category') result = await supabase.from('categories').delete().eq('id', target.item.id)
    else if (target.type === 'speaker') result = await supabase.from('speakers').delete().eq('id', target.item.id)
    else if (target.type === 'series') result = await supabase.from('session_series').delete().eq('id', target.item.id)
    else if (target.type === 'session') result = await supabase.from('sessions').delete().eq('id', target.item.id)
    else result = await supabase.from('session_videos').delete().eq('id', target.item.id)
    if (result.error) throw result.error
    success(ar ? 'تم الحذف.' : 'Deleted.'); await load()
  }
  const tabs: {key:LibraryType;label:string}[] = [{key:'sessions',label:ar?'السيشنات':'Sessions'},{key:'videos',label:ar?'التسجيلات':'Recordings'},{key:'speakers',label:ar?'المتحدثون':'Speakers'},{key:'categories',label:ar?'التصنيفات':'Categories'},{key:'series',label:ar?'السلاسل':'Series'}]


  return <section className="admin-content-library">
    <header className="content-library-hero"><div><span className="eyebrow">{ar?'مركز الإدارة':'Management hub'}</span><h1>{ar?'إدارة المحتوى':'Content management'}</h1><p>{ar?'اختاري نوع المحتوى أولاً، وبعدها ادخلي لكل ما يخصه من تعديل وإدارة.':'Choose a content area, then manage everything related to it.'}</p></div><Icon name="layers" /></header>
    <div className="management-hub-choices">
      <button type="button" className={area==='sessions'?'active':''} onClick={()=>chooseArea('sessions')}><Icon name="play" /><span><strong>{ar?'السيشنات':'Sessions'}</strong><small>{ar?'السيشنات، التسجيلات، المتحدثون، التصنيفات والسلاسل':'Sessions, recordings, speakers, categories and series'}</small></span></button>
      <button type="button" className={area==='events'?'active':''} onClick={()=>chooseArea('events')}><Icon name="calendar" /><span><strong>{ar?'الفعاليات':'Events'}</strong><small>{ar?'الفعالية، الألبوم والمسابقات الأكاديمية':'Event details, albums and academic competitions'}</small></span></button>
    </div>
    {area === 'events' ? <div className="management-events-inside"><AdminEventsPanel /><AdminCompetitionsWorkspace /></div> : <>
    <nav className="content-library-tabs">{tabs.map(tab=><button key={tab.key} className={type===tab.key?'active':''} onClick={()=>choose(tab.key)}>{tab.label}</button>)}</nav>
    <div className="content-library-toolbar"><label><span>{ar?'بحث':'Search'}</span><input value={query} onChange={e=>setQuery(e.target.value)} placeholder={ar?'اكتب الاسم أو أي كلمة للبحث…':'Search by name or keyword…'} /></label><strong>{rows.length} {ar?'نتيجة':'results'}</strong></div>
    <div className="content-library-grid">{rows.map(row=><article className="content-library-card" key={row.id}><div><strong>{row.title}</strong><small>{row.meta}</small></div><div className="content-library-actions"><button className="button button-ghost" onClick={()=>setEditing(row.target)}>{ar?'تعديل':'Edit'}</button><button className="button danger" onClick={()=>setConfirmation({title:ar?'تأكيد الحذف':'Confirm deletion',description:ar?`سيتم حذف «${row.title}» نهائيًا.`:`“${row.title}” will be permanently deleted.`,action:()=>remove(row.target)})}>{ar?'حذف':'Delete'}</button></div></article>)}</div>
    {!rows.length && <div className="empty-state">{ar?'لا توجد نتائج مطابقة للبحث.':'No matching results.'}</div>}</>}
    <AdminEditorDialog target={editing} categories={categories} speakers={speakers} series={series} sessions={sessions} language={language} busy={editorBusy} onClose={()=>!editorBusy&&setEditing(null)} onSave={saveEdit} />
    <ConfirmDialog open={Boolean(confirmation)} title={confirmation?.title||''} description={confirmation?.description||''} confirmLabel={ar?'نعم، حذف':'Yes, delete'} cancelLabel={ar?'إلغاء':'Cancel'} tone="danger" busy={confirmBusy} onCancel={()=>!confirmBusy&&setConfirmation(null)} onConfirm={()=>{if(!confirmation)return;setConfirmBusy(true);void confirmation.action().then(()=>setConfirmation(null)).catch(fail).finally(()=>setConfirmBusy(false))}} />
  </section>
}
