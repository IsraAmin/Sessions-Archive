import { useState } from 'react'
import { useSearchParams } from 'react-router-dom'
import { AdminEventsPanel } from '../components/AdminEventsPanel'
import { AdminCompetitionsWorkspace } from '../components/AdminCompetitionsWorkspace'
import { useUi } from '../hooks/useUi'
import { Icon } from '../components/Icon'

export function AdminEventsLibraryPage() {
  const { language } = useUi()
  const ar = language === 'ar'
  const [params, setParams] = useSearchParams()
  const [type, setType] = useState<'events'|'competitions'>(params.get('type') === 'competitions' ? 'competitions' : 'events')
  function choose(next:'events'|'competitions'){ setType(next); setParams({type:next},{replace:true}) }
  return <section className="admin-events-library-page">
    <header className="content-library-hero"><div><span className="eyebrow">{ar?'إدارة المحفوظ':'Saved content management'}</span><h1>{ar?'الفعاليات والمسابقات المحفوظة':'Saved events & competitions'}</h1><p>{ar?'ابحثي عن الفعالية المطلوبة وعدّلي بياناتها أو ألبومها أو تفاصيل المسابقة من هنا، بعيدًا عن صفحة إضافة فعالية جديدة.':'Find an existing event and edit its details, album, or competition data here, away from the creation page.'}</p></div><Icon name="calendar" /></header>
    <nav className="content-library-tabs"><button className={type==='events'?'active':''} onClick={()=>choose('events')}>{ar?'الفعاليات':'Events'}</button><button className={type==='competitions'?'active':''} onClick={()=>choose('competitions')}>{ar?'المسابقات الأكاديمية':'Academic competitions'}</button></nav>
    {type==='events'?<AdminEventsPanel/>:<AdminCompetitionsWorkspace/>}
  </section>
}
