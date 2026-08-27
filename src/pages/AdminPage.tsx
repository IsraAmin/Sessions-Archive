import { useEffect, useState, type FormEvent } from 'react'
import { supabase } from '../lib/supabase'
import { StatCard } from '../components/StatCard'
import type { Category, Session, Speaker } from '../types/domain'
import { errorMessage } from '../lib/errors'

export function AdminPage() {
  const [categories, setCategories] = useState<Category[]>([])
  const [speakers, setSpeakers] = useState<Speaker[]>([])
  const [sessions, setSessions] = useState<Session[]>([])
  const [usersCount, setUsersCount] = useState(0)
  const [registrationsCount, setRegistrationsCount] = useState(0)
  const [message, setMessage] = useState('')

  async function load() {
    const [cat, spk, ses, users, regs] = await Promise.all([
      supabase.from('categories').select('*').order('name'),
      supabase.from('speakers').select('*').order('name'),
      supabase.from('sessions').select('*').order('starts_at', { ascending: false }),
      supabase.from('profiles').select('*', { count: 'exact', head: true }),
      supabase.from('registrations').select('*', { count: 'exact', head: true }),
    ])
    setCategories((cat.data ?? []) as Category[])
    setSpeakers((spk.data ?? []) as Speaker[])
    setSessions((ses.data ?? []) as Session[])
    setUsersCount(users.count ?? 0)
    setRegistrationsCount(regs.count ?? 0)
  }

  useEffect(() => { void load() }, [])

  async function run(task: () => PromiseLike<{ error: unknown }>, successMessage?: string) {
    setMessage('')
    try {
      const result = await task()
      if (result.error) throw result.error
      if (successMessage) setMessage(successMessage)
      await load()
    } catch (error) {
      setMessage(errorMessage(error))
    }
  }

  async function addCategory(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    const formElement = event.currentTarget
    const form = new FormData(formElement)
    const name = String(form.get('name') || '').trim()
    const slug = String(form.get('slug') || '').trim()
    if (!name || !slug) return
    await run(() => supabase.from('categories').insert({ name, slug }), 'تمت إضافة التصنيف.')
    formElement.reset()
  }

  async function addSpeaker(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    const formElement = event.currentTarget
    const form = new FormData(formElement)
    const name = String(form.get('name') || '').trim()
    const organization = String(form.get('organization') || '').trim() || null
    if (!name) return
    await run(() => supabase.from('speakers').insert({ name, organization }), 'تمت إضافة المتحدث.')
    formElement.reset()
  }

  async function addSession(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    const formElement = event.currentTarget
    const form = new FormData(formElement)
    const payload = {
      title: String(form.get('title') || '').trim(),
      slug: String(form.get('slug') || '').trim(),
      description: String(form.get('description') || '').trim(),
      starts_at: new Date(String(form.get('starts_at'))).toISOString(),
      capacity: Number(form.get('capacity') || 30),
      category_id: String(form.get('category_id') || '') || null,
      speaker_id: String(form.get('speaker_id') || '') || null,
      status: 'published' as const,
    }
    if (!payload.title || !payload.slug || !payload.description) return
    await run(() => supabase.from('sessions').insert(payload), 'تم إنشاء السيشن.')
    formElement.reset()
  }

  async function uploadSpeakerImage(speaker: Speaker, file: File) {
    const extension = file.name.split('.').pop()?.toLowerCase() || 'jpg'
    const path = `${speaker.id}/photo.${extension}`
    setMessage('')
    try {
      const { error: uploadError } = await supabase.storage.from('speaker-images').upload(path, file, { upsert: true })
      if (uploadError) throw uploadError
      const { error } = await supabase.from('speakers').update({ image_path: path }).eq('id', speaker.id)
      if (error) throw error
      setMessage('تم رفع صورة المتحدث.')
      await load()
    } catch (error) { setMessage(errorMessage(error)) }
  }

  async function uploadSessionCover(session: Session, file: File) {
    const extension = file.name.split('.').pop()?.toLowerCase() || 'jpg'
    const path = `${session.id}/cover.${extension}`
    setMessage('')
    try {
      const { error: uploadError } = await supabase.storage.from('session-covers').upload(path, file, { upsert: true })
      if (uploadError) throw uploadError
      const { error } = await supabase.from('sessions').update({ cover_path: path }).eq('id', session.id)
      if (error) throw error
      setMessage('تم رفع غلاف السيشن.')
      await load()
    } catch (error) { setMessage(errorMessage(error)) }
  }

  async function uploadSessionResource(session: Session, file: File) {
    const safeName = file.name.replace(/[^a-zA-Z0-9._-]/g, '-')
    const path = `${session.id}/${Date.now()}-${safeName}`
    setMessage('')
    try {
      const { error: uploadError } = await supabase.storage.from('session-resources').upload(path, file)
      if (uploadError) throw uploadError
      const { error } = await supabase.from('session_resources').insert({
        session_id: session.id,
        title: file.name,
        file_path: path,
      })
      if (error) {
        await supabase.storage.from('session-resources').remove([path])
        throw error
      }
      setMessage('تم رفع ملف السيشن.')
    } catch (error) { setMessage(errorMessage(error)) }
  }

  async function sendNotification(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    const formElement = event.currentTarget
    const form = new FormData(formElement)
    const title = String(form.get('title') || '').trim()
    const body = String(form.get('body') || '').trim()
    const url = String(form.get('url') || '').trim() || '/'
    if (!title || !body) return
    setMessage('')
    try {
      const { error } = await supabase.functions.invoke('send-session-notification', { body: { title, body, url } })
      if (error) throw error
      setMessage('تم إرسال طلب الإشعار للمشتركين.')
      formElement.reset()
    } catch (error) { setMessage(errorMessage(error)) }
  }

  return (
    <section>
      <div className="section-heading"><div><div className="eyebrow">Admin only</div><h1>لوحة الإدارة</h1></div></div>
      <div className="stats-grid">
        <StatCard label="المستخدمون" value={usersCount} />
        <StatCard label="السيشنات" value={sessions.length} />
        <StatCard label="التسجيلات" value={registrationsCount} />
        <StatCard label="المتحدثون" value={speakers.length} />
      </div>

      <div className="bar-chart panel" aria-label="رسم إحصائي مبسط">
        {[['Users', usersCount], ['Sessions', sessions.length], ['Registrations', registrationsCount], ['Speakers', speakers.length]].map(([label, raw]) => {
          const value = Number(raw)
          const max = Math.max(usersCount, sessions.length, registrationsCount, speakers.length, 1)
          return <div className="bar-row" key={String(label)}><span>{label}</span><div><i style={{ width: `${Math.max(4, value / max * 100)}%` }} /></div><strong>{value}</strong></div>
        })}
      </div>

      <div className="admin-grid">
        <section className="panel">
          <h2>Categories</h2>
          <form className="inline-form" onSubmit={(e) => void addCategory(e)}><input name="name" placeholder="الاسم" required /><input name="slug" placeholder="slug" required /><button className="button button-primary">إضافة</button></form>
          <div className="admin-list">{categories.map((category) => <div key={category.id}><span>{category.name}</span><div><button onClick={() => { const name = window.prompt('الاسم الجديد', category.name); if (name) void run(() => supabase.from('categories').update({ name }).eq('id', category.id)) }}>تعديل</button><button onClick={() => void run(() => supabase.from('categories').delete().eq('id', category.id))}>حذف</button></div></div>)}</div>
        </section>

        <section className="panel">
          <h2>Speakers</h2>
          <form className="inline-form" onSubmit={(e) => void addSpeaker(e)}><input name="name" placeholder="الاسم" required /><input name="organization" placeholder="الجهة" /><button className="button button-primary">إضافة</button></form>
          <div className="admin-list">{speakers.map((speaker) => <div key={speaker.id}><span>{speaker.name}</span><div className="row-actions"><label className="file-action">صورة<input type="file" accept="image/*" onChange={(e) => e.target.files?.[0] && void uploadSpeakerImage(speaker, e.target.files[0])} /></label><button onClick={() => { const name = window.prompt('الاسم الجديد', speaker.name); if (name) void run(() => supabase.from('speakers').update({ name }).eq('id', speaker.id)) }}>تعديل</button><button onClick={() => void run(() => supabase.from('speakers').delete().eq('id', speaker.id))}>حذف</button></div></div>)}</div>
        </section>
      </div>

      <section className="panel section-gap">
        <h2>Sessions</h2>
        <form className="session-admin-form" onSubmit={(e) => void addSession(e)}>
          <input name="title" placeholder="العنوان" required /><input name="slug" placeholder="slug" required />
          <textarea name="description" placeholder="الوصف" required />
          <input name="starts_at" type="datetime-local" required /><input name="capacity" type="number" min="1" defaultValue="30" required />
          <select name="category_id"><option value="">بدون تصنيف</option>{categories.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}</select>
          <select name="speaker_id"><option value="">بدون متحدث</option>{speakers.map((s) => <option key={s.id} value={s.id}>{s.name}</option>)}</select>
          <button className="button button-primary">إنشاء Session</button>
        </form>
        <div className="admin-list">{sessions.map((session) => <div key={session.id}><span><strong>{session.title}</strong> — {session.status}</span><div className="row-actions"><label className="file-action">غلاف<input type="file" accept="image/*" onChange={(e) => e.target.files?.[0] && void uploadSessionCover(session, e.target.files[0])} /></label><label className="file-action">Resource<input type="file" onChange={(e) => e.target.files?.[0] && void uploadSessionResource(session, e.target.files[0])} /></label><button onClick={() => { const title = window.prompt('العنوان الجديد', session.title); if (title) void run(() => supabase.from('sessions').update({ title }).eq('id', session.id)) }}>تعديل</button><button onClick={() => void run(() => supabase.from('sessions').delete().eq('id', session.id))}>حذف</button></div></div>)}</div>
      </section>

      <section className="panel section-gap">
        <h2>Push Notification</h2>
        <p>إرسال Broadcast للمستخدمين الذين فعّلوا الإشعارات. التنفيذ الفعلي يتم من Edge Function محمية بدور Admin.</p>
        <form className="session-admin-form" onSubmit={(e) => void sendNotification(e)}>
          <input name="title" placeholder="عنوان الإشعار" required />
          <input name="url" placeholder="/sessions/UUID" />
          <textarea name="body" placeholder="نص الإشعار" required />
          <button className="button button-primary">إرسال الإشعار</button>
        </form>
      </section>

      {message && <p className="notice">{message}</p>}
    </section>
  )
}
