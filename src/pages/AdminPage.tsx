import { useEffect, useMemo, useState, type FormEvent } from 'react'
import { publicStorageUrl, supabase } from '../lib/supabase'
import { StatCard } from '../components/StatCard'
import type { Category, Profile, Session, SessionSeries, SessionVideo, Speaker } from '../types/domain'
import { errorMessage } from '../lib/errors'
import { extractYouTubeVideoId } from '../lib/youtube'
import { YouTubePlayer } from '../components/YouTubePlayer'
import { useUi } from '../hooks/useUi'
import { useAuth } from '../hooks/useAuth'
import { useToast } from '../components/ToastProvider'
import { Icon } from '../components/Icon'
import { StarRating } from '../components/StarRating'

type RegistrationAnalytics = { user_id: string; session_id: string; attendance_status: string; session: { category_id: string | null; speaker_id: string | null } | null }
type FeedbackAnalytics = { user_id: string; session_id: string; rating: number; session: { category_id: string | null; speaker_id: string | null } | null }
type ViewAnalytics = { user_id: string; session_id: string }
type ProgressAnalytics = { user_id: string; video_id: string; video: { session_id: string } | null }
type ManagedUser = {
  id: string
  email: string
  phone: string | null
  full_name: string
  role: 'admin' | 'student'
  super_admin: boolean
  banned_until: string | null
  created_at: string
  updated_at: string | null
  last_sign_in_at: string | null
  email_confirmed_at: string | null
  phone_confirmed_at: string | null
  is_anonymous: boolean
  providers: string[]
  profile: Profile | null
  activity: { registrations: number; feedback: number; video_progress: number }
}

function rankedEntries(values: Map<string, number>, labels: Map<string, string>, limit = 5) {
  return [...values.entries()].map(([id, value]) => ({ id, value, label: labels.get(id) ?? id })).sort((a, b) => b.value - a.value).slice(0, limit)
}

function FormField({ label, children, wide = false, hint }: { label: string; children: React.ReactNode; wide?: boolean; hint?: string }) {
  return <label className={`form-field ${wide ? 'wide' : ''}`}><span className="field-label">{label}</span>{children}{hint && <span className="field-hint">{hint}</span>}</label>
}

export function AdminPage() {
  const { language, locale, t } = useUi()
  const { isSuperAdmin } = useAuth()
  const { showToast } = useToast()
  const [categories, setCategories] = useState<Category[]>([])
  const [speakers, setSpeakers] = useState<Speaker[]>([])
  const [sessions, setSessions] = useState<Session[]>([])
  const [series, setSeries] = useState<SessionSeries[]>([])
  const [videos, setVideos] = useState<SessionVideo[]>([])
  const [profiles, setProfiles] = useState<Profile[]>([])
  const [registrations, setRegistrations] = useState<RegistrationAnalytics[]>([])
  const [feedbackRows, setFeedbackRows] = useState<FeedbackAnalytics[]>([])
  const [viewRows, setViewRows] = useState<ViewAnalytics[]>([])
  const [progressRows, setProgressRows] = useState<ProgressAnalytics[]>([])
  const [managedUsers, setManagedUsers] = useState<ManagedUser[]>([])
  const [videoSessionId, setVideoSessionId] = useState('')
  const [videoTitle, setVideoTitle] = useState('')
  const [videoUrl, setVideoUrl] = useState('')
  const [busyUsers, setBusyUsers] = useState(false)
  const [userSearch, setUserSearch] = useState('')
  const [selectedUserId, setSelectedUserId] = useState<string | null>(null)

  function success(message: string) { showToast({ kind: 'success', title: t('common.success'), message }) }
  function fail(error: unknown) { showToast({ kind: 'error', title: t('common.error'), message: errorMessage(error) }) }

  async function load() {
    const [cat, spk, ses, ser, vid, prof, regs, feeds, views, progress] = await Promise.all([
      supabase.from('categories').select('*').order('name'),
      supabase.from('speakers').select('*').order('name'),
      supabase.from('sessions').select('*').order('starts_at', { ascending: false }),
      supabase.from('session_series').select('*').order('created_at', { ascending: false }),
      supabase.from('session_videos').select('*').order('session_id').order('position'),
      supabase.from('profiles').select('*'),
      supabase.from('registrations').select('user_id,session_id,attendance_status,session:sessions(category_id,speaker_id)'),
      supabase.from('feedback').select('user_id,session_id,rating,session:sessions(category_id,speaker_id)'),
      supabase.from('session_views').select('user_id,session_id'),
      supabase.from('video_progress').select('user_id,video_id,video:session_videos(session_id)'),
    ])
    setCategories((cat.data ?? []) as Category[]); setSpeakers((spk.data ?? []) as Speaker[]); setSessions((ses.data ?? []) as Session[])
    setSeries((ser.data ?? []) as SessionSeries[]); setVideos((vid.data ?? []) as SessionVideo[]); setProfiles((prof.data ?? []) as Profile[])
    setRegistrations((regs.data ?? []) as unknown as RegistrationAnalytics[]); setFeedbackRows((feeds.data ?? []) as unknown as FeedbackAnalytics[])
    setViewRows((views.data ?? []) as ViewAnalytics[]); setProgressRows((progress.data ?? []) as unknown as ProgressAnalytics[])
  }

  async function loadManagedUsers() {
    if (!isSuperAdmin) return
    setBusyUsers(true)
    try {
      const { data, error } = await supabase.functions.invoke('manage-users', { body: { action: 'list' } })
      if (error) throw error
      const payload = data as { users?: ManagedUser[]; error?: string }
      if (payload.error) throw new Error(payload.error)
      setManagedUsers(payload.users ?? [])
    } catch (error) { fail(error) } finally { setBusyUsers(false) }
  }

  useEffect(() => { void load() }, [])
  useEffect(() => { if (isSuperAdmin) void loadManagedUsers() }, [isSuperAdmin])

  async function run(task: () => PromiseLike<{ error: unknown }>, successMessage: string) {
    try { const result = await task(); if (result.error) throw result.error; success(successMessage); await load() }
    catch (error) { fail(error) }
  }

  async function addCategory(event: FormEvent<HTMLFormElement>) {
    event.preventDefault(); const formElement = event.currentTarget; const form = new FormData(formElement)
    const name = String(form.get('name') || '').trim(); const slug = String(form.get('slug') || '').trim(); if (!name || !slug) return
    await run(() => supabase.from('categories').insert({ name, slug }), language === 'ar' ? 'تمت إضافة التصنيف.' : 'Category added.'); formElement.reset()
  }

  async function addSpeaker(event: FormEvent<HTMLFormElement>) {
    event.preventDefault(); const formElement = event.currentTarget; const form = new FormData(formElement)
    const name = String(form.get('name') || '').trim(); const organization = String(form.get('organization') || '').trim() || null; if (!name) return
    await run(() => supabase.from('speakers').insert({ name, organization }), language === 'ar' ? 'تمت إضافة المتحدث.' : 'Speaker added.'); formElement.reset()
  }

  async function addSeries(event: FormEvent<HTMLFormElement>) {
    event.preventDefault(); const formElement = event.currentTarget; const form = new FormData(formElement)
    const title = String(form.get('title') || '').trim(); const description = String(form.get('description') || '').trim() || null; if (!title) return
    await run(() => supabase.from('session_series').insert({ title, description }), language === 'ar' ? 'تم إنشاء السلسلة.' : 'Series created.'); formElement.reset()
  }

  async function addSession(event: FormEvent<HTMLFormElement>) {
    event.preventDefault(); const formElement = event.currentTarget; const form = new FormData(formElement)
    const seriesId = String(form.get('series_id') || '') || null
    const payload = {
      title: String(form.get('title') || '').trim(), slug: String(form.get('slug') || '').trim(), description: String(form.get('description') || '').trim(),
      starts_at: new Date(String(form.get('starts_at'))).toISOString(), capacity: Number(form.get('capacity') || 30),
      category_id: String(form.get('category_id') || '') || null, speaker_id: String(form.get('speaker_id') || '') || null,
      series_id: seriesId, series_position: seriesId ? Number(form.get('series_position') || 1) : null, status: 'published',
    }
    if (!payload.title || !payload.slug || !payload.description) return
    await run(() => supabase.from('sessions').insert(payload), language === 'ar' ? 'تم إنشاء السيشن.' : 'Session created.'); formElement.reset()
  }

  async function uploadSpeakerImage(speaker: Speaker, file: File) {
    const extension = file.name.split('.').pop()?.toLowerCase() || 'jpg'; const path = `${speaker.id}/photo.${extension}`
    try { const { error: uploadError } = await supabase.storage.from('speaker-images').upload(path, file, { upsert: true }); if (uploadError) throw uploadError; const { error } = await supabase.from('speakers').update({ image_path: path }).eq('id', speaker.id); if (error) throw error; success(language === 'ar' ? 'تم تحديث صورة المتحدث.' : 'Speaker photo updated.'); await load() } catch (error) { fail(error) }
  }

  async function uploadSessionCover(session: Session, file: File) {
    const extension = file.name.split('.').pop()?.toLowerCase() || 'jpg'; const path = `${session.id}/cover.${extension}`
    try { const { error: uploadError } = await supabase.storage.from('session-covers').upload(path, file, { upsert: true }); if (uploadError) throw uploadError; const { error } = await supabase.from('sessions').update({ cover_path: path }).eq('id', session.id); if (error) throw error; success(language === 'ar' ? 'تم تحديث غلاف السيشن.' : 'Session cover updated.'); await load() } catch (error) { fail(error) }
  }

  async function uploadSessionResource(session: Session, file: File) {
    const safeName = file.name.replace(/[^a-zA-Z0-9._-]/g, '-'); const path = `${session.id}/${Date.now()}-${safeName}`
    try { const { error: uploadError } = await supabase.storage.from('session-resources').upload(path, file); if (uploadError) throw uploadError; const { error } = await supabase.from('session_resources').insert({ session_id: session.id, title: file.name, file_path: path }); if (error) { await supabase.storage.from('session-resources').remove([path]); throw error } success(language === 'ar' ? 'تم رفع ملف السيشن.' : 'Session resource uploaded.') } catch (error) { fail(error) }
  }

  async function addSessionVideo(event: FormEvent<HTMLFormElement>) {
    event.preventDefault(); const videoId = extractYouTubeVideoId(videoUrl)
    if (!videoSessionId || !videoTitle.trim() || !videoId) { fail(new Error(language === 'ar' ? 'اختر السيشن واكتب عنوانًا والصق رابط YouTube صالحًا.' : 'Choose a session, add a title, and paste a valid YouTube URL.')); return }
    const nextPosition = videos.filter((video) => video.session_id === videoSessionId).length
    await run(() => supabase.from('session_videos').insert({ session_id: videoSessionId, title: videoTitle.trim(), youtube_video_id: videoId, position: nextPosition }), language === 'ar' ? 'تمت إضافة التسجيل.' : 'Recording added.')
    setVideoTitle(''); setVideoUrl('')
  }

  async function sendNotification(event: FormEvent<HTMLFormElement>) {
    event.preventDefault(); const formElement = event.currentTarget; const form = new FormData(formElement)
    const title = String(form.get('title') || '').trim(); const body = String(form.get('body') || '').trim(); const url = String(form.get('url') || '').trim() || '/'; if (!title || !body) return
    try { const { error } = await supabase.functions.invoke('send-session-notification', { body: { title, body, url } }); if (error) throw error; success(language === 'ar' ? 'تم إرسال الإشعار.' : 'Notification sent.'); formElement.reset() } catch (error) { fail(error) }
  }

  async function manageUser(userId: string, action: 'set_role' | 'ban' | 'unban', role?: 'admin' | 'student') {
    const confirmText = action === 'set_role'
      ? role === 'admin' ? (language === 'ar' ? 'ترقية هذا المستخدم إلى Admin؟' : 'Promote this user to Admin?') : (language === 'ar' ? 'سحب صلاحية Admin من هذا المستخدم؟' : 'Remove Admin access from this user?')
      : action === 'ban' ? (language === 'ar' ? 'تعطيل هذا الحساب؟' : 'Disable this account?') : null
    if (confirmText && !window.confirm(confirmText)) return
    setBusyUsers(true)
    try {
      const { data, error } = await supabase.functions.invoke('manage-users', { body: { action, user_id: userId, role } })
      if (error) throw error
      const payload = data as { error?: string }
      if (payload.error) throw new Error(payload.error)
      success(language === 'ar' ? 'تم تحديث صلاحية المستخدم.' : 'User access updated.')
      await loadManagedUsers()
    } catch (error) { fail(error) } finally { setBusyUsers(false) }
  }

  const analytics = useMemo(() => {
    const attended = registrations.filter((row) => row.attendance_status === 'attended').length
    const avgRating = feedbackRows.length ? feedbackRows.reduce((sum, row) => sum + row.rating, 0) / feedbackRows.length : 0
    const conversion = viewRows.length ? Math.min(100, registrations.length / viewRows.length * 100) : 0
    const categoryCounts = new Map<string, number>(); const speakerCounts = new Map<string, number>(); const activity = new Map<string, number>()
    for (const row of registrations) {
      if (row.session?.category_id) categoryCounts.set(row.session.category_id, (categoryCounts.get(row.session.category_id) ?? 0) + 1)
      if (row.session?.speaker_id) speakerCounts.set(row.session.speaker_id, (speakerCounts.get(row.session.speaker_id) ?? 0) + 1)
      activity.set(row.user_id, (activity.get(row.user_id) ?? 0) + 3)
    }
    for (const row of feedbackRows) activity.set(row.user_id, (activity.get(row.user_id) ?? 0) + 2)
    for (const row of progressRows) activity.set(row.user_id, (activity.get(row.user_id) ?? 0) + 1)
    return {
      attended, avgRating, conversion,
      categories: rankedEntries(categoryCounts, new Map(categories.map((item) => [item.id, item.name]))),
      speakers: rankedEntries(speakerCounts, new Map(speakers.map((item) => [item.id, item.name]))),
      students: rankedEntries(activity, new Map(profiles.map((item) => [item.id, item.full_name]))),
    }
  }, [registrations, feedbackRows, viewRows, progressRows, categories, speakers, profiles])

  const filteredUsers = useMemo(() => {
    const query = userSearch.trim().toLocaleLowerCase()
    if (!query) return managedUsers
    return managedUsers.filter((account) => {
      const profile = account.profile
      return [account.full_name, account.email, account.phone, profile?.university, profile?.department, profile?.level]
        .filter(Boolean)
        .some((value) => String(value).toLocaleLowerCase().includes(query))
    })
  }, [managedUsers, userSearch])

  const selectedUser = selectedUserId ? managedUsers.find((account) => account.id === selectedUserId) ?? null : null
  const maxRanking = Math.max(1, ...analytics.categories.map((item) => item.value), ...analytics.speakers.map((item) => item.value))
  const date = (value: string | null) => value ? new Intl.DateTimeFormat(locale, { dateStyle: 'medium', timeStyle: 'short' }).format(new Date(value)) : '—'

  return <section className="admin-page-v2">
    <div className="section-heading"><div><div className="eyebrow">{t('admin.eyebrow')}</div><h1>{t('admin.title')}</h1><p>{t('admin.subtitle')}</p></div></div>
    <div className="stats-grid stats-grid-v2"><StatCard label={t('admin.users')} value={profiles.length} /><StatCard label={t('admin.sessions')} value={sessions.length} /><StatCard label={t('admin.registrations')} value={registrations.length} /><StatCard label={t('admin.speakers')} value={speakers.length} /></div>

    <section className="panel section-gap admin-section"><div className="admin-section-heading"><div><span className="eyebrow">{t('admin.analytics')}</span><h2>{t('admin.analytics')}</h2></div><Icon name="chart" /></div>
      <div className="analytics-kpis"><div><span>{t('admin.views')}</span><strong>{viewRows.length}</strong></div><div><span>{t('admin.attendanceRate')}</span><strong>{registrations.length ? Math.round(analytics.attended / registrations.length * 100) : 0}%</strong></div><div className="rating-kpi"><span>{t('admin.avgRating')}</span><strong><StarRating value={analytics.avgRating} label={t('admin.avgRating')} readOnly /></strong></div><div><span>{t('admin.videoStarts')}</span><strong>{progressRows.length}</strong></div><div><span>{t('admin.conversion')}</span><strong>{Math.round(analytics.conversion)}%</strong></div></div>
      <div className="analytics-grid">
        <div><h3>{t('admin.topCategories')}</h3>{analytics.categories.length ? analytics.categories.map((item) => <div className="ranking-row" key={item.id}><span>{item.label}</span><i><b style={{ width: `${item.value / maxRanking * 100}%` }} /></i><strong>{item.value}</strong></div>) : <div className="empty-state">—</div>}</div>
        <div><h3>{t('admin.topSpeakers')}</h3>{analytics.speakers.length ? analytics.speakers.map((item) => <div className="ranking-row" key={item.id}><span>{item.label}</span><i><b style={{ width: `${item.value / maxRanking * 100}%` }} /></i><strong>{item.value}</strong></div>) : <div className="empty-state">—</div>}</div>
        <div><h3>{t('admin.activeStudents')}</h3>{analytics.students.length ? analytics.students.map((item, index) => <div className="student-rank" key={item.id}><em>{index + 1}</em><span>{item.label}</span><strong>{item.value}</strong></div>) : <div className="empty-state">—</div>}</div>
      </div>
    </section>

    {isSuperAdmin && <section className="panel section-gap admin-section">
      <div className="admin-section-heading"><div><span className="eyebrow">{t('admin.superAdmin')}</span><h2>{t('admin.userManagement')}</h2><p>{t('admin.superOnly')}</p></div><Icon name="users" /></div>
      <div className="user-directory-toolbar">
        <label className="form-field user-search-field"><span className="field-label">{language === 'ar' ? 'البحث في حسابات المستخدمين' : 'Search user accounts'}</span><input value={userSearch} onChange={(event) => setUserSearch(event.target.value)} placeholder={language === 'ar' ? 'الاسم، الإيميل، الجامعة أو القسم…' : 'Name, email, university, or department…'} /></label>
        <span className="user-result-count">{language === 'ar' ? `${filteredUsers.length} حساب` : `${filteredUsers.length} accounts`}</span>
      </div>
      <div className="user-management-list">{filteredUsers.map((account) => {
        const banned = Boolean(account.banned_until && new Date(account.banned_until).getTime() > Date.now())
        const displayName = account.profile?.full_name || account.full_name || account.email
        return <article className="user-management-row" key={account.id}>
          <div className="user-identity"><span className="sidebar-user-avatar">{displayName.slice(0, 1).toUpperCase()}</span><span><strong>{displayName}</strong><small>{account.email}</small></span></div>
          <div className="user-role"><span className={`role-pill ${account.super_admin ? 'super' : account.role}`}>{account.super_admin ? t('admin.superAdmin') : account.role === 'admin' ? t('admin.roleAdmin') : t('admin.roleStudent')}</span>{banned && <span className="role-pill banned">{language === 'ar' ? 'معطّل' : 'Disabled'}</span>}</div>
          <div className="user-activity"><small>{t('admin.activity')}</small><span>{account.activity.registrations} {language === 'ar' ? 'تسجيل' : 'reg.'} · {account.activity.feedback} {language === 'ar' ? 'تقييم' : 'ratings'}</span></div>
          <div className="user-management-actions">
            <button className="button user-action user-action-view" disabled={busyUsers} onClick={() => setSelectedUserId(account.id)}><Icon name="user" />{language === 'ar' ? 'عرض التفاصيل' : 'View details'}</button>
            {!account.super_admin && (account.role === 'admin'
              ? <button className="button user-action user-action-demote" disabled={busyUsers} onClick={() => void manageUser(account.id, 'set_role', 'student')}><Icon name="shield" />{t('admin.demote')}</button>
              : <button className="button user-action user-action-promote" disabled={busyUsers} onClick={() => void manageUser(account.id, 'set_role', 'admin')}><Icon name="shield" />{t('admin.promote')}</button>)}
          </div>
        </article>
      })}{busyUsers && !managedUsers.length && <div className="page-state">{t('common.loading')}</div>}{!busyUsers && !filteredUsers.length && <div className="empty-state">{language === 'ar' ? 'لا توجد حسابات مطابقة للبحث.' : 'No accounts match your search.'}</div>}</div>
    </section>}

    <section className="panel section-gap admin-section"><div className="admin-section-heading"><div><span className="eyebrow">{t('admin.series')}</span><h2>{t('admin.series')}</h2></div><Icon name="layers" /></div>
      <form className="series-form" onSubmit={(event) => void addSeries(event)}>
        <FormField label={t('admin.seriesTitle')}><input name="title" placeholder={language === 'ar' ? 'مثال: Web Development Bootcamp' : 'Example: Web Development Bootcamp'} required /></FormField>
        <FormField label={t('admin.seriesDescription')}><input name="description" placeholder={language === 'ar' ? 'وصف مختصر للسلسلة' : 'Short series description'} /></FormField>
        <button className="button button-primary">{t('admin.createSeries')}</button>
      </form>
      <div className="admin-list">{series.map((item) => <div key={item.id}><span><strong>{item.title}</strong>{item.description && <small>{item.description}</small>}</span><div><button onClick={() => { const title = window.prompt(t('admin.seriesTitle'), item.title); if (title?.trim()) void run(() => supabase.from('session_series').update({ title: title.trim() }).eq('id', item.id), language === 'ar' ? 'تم تحديث السلسلة.' : 'Series updated.') }}>{t('common.edit')}</button><button className="danger-link" onClick={() => { if (window.confirm(t('common.delete'))) void run(() => supabase.from('session_series').delete().eq('id', item.id), language === 'ar' ? 'تم حذف السلسلة.' : 'Series deleted.') }}>{t('common.delete')}</button></div></div>)}</div>
    </section>

    <div className="admin-grid section-gap">
      <section className="panel"><h2>{t('admin.category')}</h2><form className="inline-form" onSubmit={(event) => void addCategory(event)}>
        <FormField label={t('admin.name')}><input name="name" placeholder={language === 'ar' ? 'اسم التصنيف' : 'Category name'} required /></FormField>
        <FormField label="Slug"><input name="slug" placeholder="web-development" required /></FormField>
        <button className="button button-primary">{t('common.add')}</button>
      </form><div className="admin-list">{categories.map((category) => <div key={category.id}><span>{category.name}</span><div><button onClick={() => { const name = window.prompt(t('admin.name'), category.name); if (name) void run(() => supabase.from('categories').update({ name }).eq('id', category.id), language === 'ar' ? 'تم تحديث التصنيف.' : 'Category updated.') }}>{t('common.edit')}</button><button className="danger-link" onClick={() => void run(() => supabase.from('categories').delete().eq('id', category.id), language === 'ar' ? 'تم حذف التصنيف.' : 'Category deleted.')}>{t('common.delete')}</button></div></div>)}</div></section>
      <section className="panel"><h2>{t('admin.speakers')}</h2><form className="inline-form" onSubmit={(event) => void addSpeaker(event)}>
        <FormField label={t('admin.name')}><input name="name" placeholder={language === 'ar' ? 'اسم المتحدث' : 'Speaker name'} required /></FormField>
        <FormField label={t('admin.organization')}><input name="organization" placeholder={language === 'ar' ? 'الجامعة أو الجهة' : 'University or organization'} /></FormField>
        <button className="button button-primary">{t('common.add')}</button>
      </form><div className="admin-list">{speakers.map((speaker) => <div key={speaker.id}><span>{speaker.name}</span><div className="row-actions"><label className="file-action">{language === 'ar' ? 'صورة' : 'Photo'}<input type="file" accept="image/*" onChange={(event) => event.target.files?.[0] && void uploadSpeakerImage(speaker, event.target.files[0])} /></label><button onClick={() => { const name = window.prompt(t('admin.name'), speaker.name); if (name) void run(() => supabase.from('speakers').update({ name }).eq('id', speaker.id), language === 'ar' ? 'تم تحديث المتحدث.' : 'Speaker updated.') }}>{t('common.edit')}</button><button className="danger-link" onClick={() => void run(() => supabase.from('speakers').delete().eq('id', speaker.id), language === 'ar' ? 'تم حذف المتحدث.' : 'Speaker deleted.')}>{t('common.delete')}</button></div></div>)}</div></section>
    </div>

    <section className="panel section-gap admin-section"><h2>{t('admin.sessions')}</h2><form className="session-admin-form" onSubmit={(event) => void addSession(event)}>
      <FormField label={t('admin.titleField')}><input name="title" placeholder={language === 'ar' ? 'عنوان السيشن' : 'Session title'} required /></FormField>
      <FormField label="Slug"><input name="slug" placeholder="session-slug" required /></FormField>
      <FormField label={t('admin.description')} wide><textarea name="description" placeholder={language === 'ar' ? 'اكتب وصفًا واضحًا للسيشن' : 'Write a clear session description'} required /></FormField>
      <FormField label={language === 'ar' ? 'موعد البداية' : 'Start date and time'}><input name="starts_at" type="datetime-local" required /></FormField>
      <FormField label={language === 'ar' ? 'السعة' : 'Capacity'}><input name="capacity" type="number" min="1" defaultValue="30" required /></FormField>
      <FormField label={language === 'ar' ? 'التصنيف' : 'Category'}><select name="category_id"><option value="">{t('admin.noCategory')}</option>{categories.map((item) => <option key={item.id} value={item.id}>{item.name}</option>)}</select></FormField>
      <FormField label={language === 'ar' ? 'المتحدث' : 'Speaker'}><select name="speaker_id"><option value="">{t('admin.noSpeaker')}</option>{speakers.map((item) => <option key={item.id} value={item.id}>{item.name}</option>)}</select></FormField>
      <FormField label={t('admin.series')}><select name="series_id"><option value="">{t('admin.noSeries')}</option>{series.map((item) => <option key={item.id} value={item.id}>{item.title}</option>)}</select></FormField>
      <FormField label={t('admin.seriesPosition')}><input name="series_position" type="number" min="1" defaultValue="1" /></FormField>
      <button className="button button-primary">{t('admin.createSession')}</button>
    </form>
      <div className="admin-list session-admin-list">{sessions.map((session) => <div key={session.id}><span><strong>{session.title}</strong><small>{new Intl.DateTimeFormat(locale, { dateStyle: 'medium' }).format(new Date(session.starts_at))}</small></span><div className="session-series-inline"><label className="form-field"><span className="field-label">{t('admin.series')}</span><select value={session.series_id ?? ''} onChange={(event) => void run(() => supabase.from('sessions').update({ series_id: event.target.value || null, series_position: event.target.value ? session.series_position ?? 1 : null }).eq('id', session.id), language === 'ar' ? 'تم تحديث السلسلة.' : 'Series assignment updated.')}><option value="">{t('admin.noSeries')}</option>{series.map((item) => <option key={item.id} value={item.id}>{item.title}</option>)}</select></label>{session.series_id && <label className="form-field"><span className="field-label">{t('admin.seriesPosition')}</span><input type="number" min="1" defaultValue={session.series_position ?? 1} onBlur={(event) => void run(() => supabase.from('sessions').update({ series_position: Number(event.target.value || 1) }).eq('id', session.id), language === 'ar' ? 'تم تحديث رقم الجزء.' : 'Part number updated.')} /></label>}</div><div className="row-actions"><label className="file-action">{t('admin.cover')}<input type="file" accept="image/*" onChange={(event) => event.target.files?.[0] && void uploadSessionCover(session, event.target.files[0])} /></label><label className="file-action">{t('admin.resource')}<input type="file" onChange={(event) => event.target.files?.[0] && void uploadSessionResource(session, event.target.files[0])} /></label><button onClick={() => { const title = window.prompt(t('admin.titleField'), session.title); if (title) void run(() => supabase.from('sessions').update({ title }).eq('id', session.id), language === 'ar' ? 'تم تحديث السيشن.' : 'Session updated.') }}>{t('common.edit')}</button><button className="danger-link" onClick={() => { if (window.confirm(t('common.delete'))) void run(() => supabase.from('sessions').delete().eq('id', session.id), language === 'ar' ? 'تم حذف السيشن.' : 'Session deleted.') }}>{t('common.delete')}</button></div></div>)}</div>
    </section>

    <section className="panel section-gap video-admin-panel"><div className="video-admin-heading"><div><div className="eyebrow">YouTube</div><h2>{t('admin.youtube')}</h2><p>{t('admin.youtubeHint')}</p></div><span className="video-admin-note">{language === 'ar' ? 'Public أو Unlisted + Embed مسموح' : 'Public or Unlisted + embedding allowed'}</span></div><div className="video-admin-layout"><form className="video-admin-form" onSubmit={(event) => void addSessionVideo(event)}>
      <FormField label={t('admin.videoSession')}><select value={videoSessionId} onChange={(event) => setVideoSessionId(event.target.value)} required><option value="">{t('admin.videoSession')}</option>{sessions.map((session) => <option key={session.id} value={session.id}>{session.title}</option>)}</select></FormField>
      <FormField label={t('admin.videoTitle')}><input value={videoTitle} onChange={(event) => setVideoTitle(event.target.value)} placeholder={language === 'ar' ? 'مثال: التسجيل الكامل' : 'Example: Full recording'} required /></FormField>
      <FormField label={t('admin.youtubeUrl')} wide><input value={videoUrl} onChange={(event) => setVideoUrl(event.target.value)} placeholder="https://youtu.be/..." inputMode="url" required /></FormField>
      <button className="button button-primary wide">{t('admin.addRecording')}</button></form><div className="video-preview">{extractYouTubeVideoId(videoUrl) ? <><span>{t('admin.preview')}</span><YouTubePlayer videoId={extractYouTubeVideoId(videoUrl)!} title={videoTitle || t('admin.preview')} /></> : <div className="video-preview-empty"><strong>{t('admin.preview')}</strong><span>{language === 'ar' ? 'الصق رابط YouTube صالحًا لرؤية المعاينة.' : 'Paste a valid YouTube URL to preview it.'}</span></div>}</div></div><div className="admin-list video-admin-list">{videos.map((video) => <div key={video.id}><span><strong>{video.title}</strong><small>{sessions.find((item) => item.id === video.session_id)?.title ?? '—'}</small></span><div><button onClick={() => { const title = window.prompt(t('admin.videoTitle'), video.title); if (title?.trim()) void run(() => supabase.from('session_videos').update({ title: title.trim() }).eq('id', video.id), language === 'ar' ? 'تم تحديث التسجيل.' : 'Recording updated.') }}>{t('common.edit')}</button><button className="danger-link" onClick={() => void run(() => supabase.from('session_videos').delete().eq('id', video.id), language === 'ar' ? 'تم حذف التسجيل.' : 'Recording deleted.')}>{t('common.delete')}</button></div></div>)}</div></section>

    <section className="panel section-gap notification-admin-panel"><h2>{t('admin.push')}</h2><form className="notification-form" onSubmit={(event) => void sendNotification(event)}>
      <FormField label={t('admin.pushTitle')}><input name="title" placeholder={language === 'ar' ? 'عنوان الإشعار' : 'Notification title'} required /></FormField>
      <FormField label={t('admin.pushBody')}><textarea name="body" placeholder={language === 'ar' ? 'نص الإشعار الذي سيظهر للمستخدم' : 'Message shown to the user'} required /></FormField>
      <FormField label={language === 'ar' ? 'الرابط داخل المنصة' : 'App link'} hint={language === 'ar' ? 'مثال: /sessions/...' : 'Example: /sessions/...'}><input name="url" placeholder="/sessions/..." defaultValue="/" /></FormField>
      <button className="button button-primary">{t('admin.sendPush')}</button>
    </form></section>

    {selectedUser && (() => {
      const profile = selectedUser.profile
      const avatar = profile?.avatar_path ? publicStorageUrl('profile-images', profile.avatar_path) : null
      const banned = Boolean(selectedUser.banned_until && new Date(selectedUser.banned_until).getTime() > Date.now())
      const displayName = profile?.full_name || selectedUser.full_name || selectedUser.email
      return <div className="user-detail-backdrop" role="presentation" onMouseDown={(event) => { if (event.currentTarget === event.target) setSelectedUserId(null) }}>
        <aside className="user-detail-drawer" role="dialog" aria-modal="true" aria-label={language === 'ar' ? 'تفاصيل حساب المستخدم' : 'User account details'}>
          <div className="user-detail-head"><div className="user-detail-identity">{avatar ? <img className="user-detail-avatar" src={avatar} alt="" /> : <span className="user-detail-avatar">{displayName.slice(0, 1).toUpperCase()}</span>}<div><h2>{displayName}</h2><p>{selectedUser.email}</p><div className="user-role"><span className={`role-pill ${selectedUser.super_admin ? 'super' : selectedUser.role}`}>{selectedUser.super_admin ? t('admin.superAdmin') : selectedUser.role === 'admin' ? t('admin.roleAdmin') : t('admin.roleStudent')}</span>{banned && <span className="role-pill banned">{language === 'ar' ? 'معطّل' : 'Disabled'}</span>}</div></div></div><button className="user-detail-close" onClick={() => setSelectedUserId(null)} aria-label={language === 'ar' ? 'إغلاق' : 'Close'}><Icon name="close" /></button></div>

          <section className="user-detail-section"><h3>{language === 'ar' ? 'بيانات الحساب' : 'Account information'}</h3><div className="user-detail-grid">
            <div className="user-data-cell wide"><span>User ID</span><strong>{selectedUser.id}</strong></div>
            <div className="user-data-cell"><span>{language === 'ar' ? 'البريد الإلكتروني' : 'Email'}</span><strong>{selectedUser.email || '—'}</strong></div>
            <div className="user-data-cell"><span>{language === 'ar' ? 'تأكيد البريد' : 'Email verified'}</span><strong>{selectedUser.email_confirmed_at ? (language === 'ar' ? 'مؤكد' : 'Verified') : (language === 'ar' ? 'غير مؤكد' : 'Not verified')}</strong></div>
            <div className="user-data-cell"><span>{language === 'ar' ? 'رقم الهاتف' : 'Phone'}</span><strong>{selectedUser.phone || '—'}</strong></div>
            <div className="user-data-cell"><span>{language === 'ar' ? 'تأكيد الهاتف' : 'Phone verified'}</span><strong>{selectedUser.phone_confirmed_at ? (language === 'ar' ? 'مؤكد' : 'Verified') : '—'}</strong></div>
            <div className="user-data-cell"><span>{language === 'ar' ? 'طريقة الدخول' : 'Providers'}</span><strong>{selectedUser.providers.length ? selectedUser.providers.join(', ') : '—'}</strong></div>
            <div className="user-data-cell"><span>{language === 'ar' ? 'تاريخ إنشاء الحساب' : 'Created'}</span><strong>{date(selectedUser.created_at)}</strong></div>
            <div className="user-data-cell"><span>{language === 'ar' ? 'آخر دخول' : 'Last sign in'}</span><strong>{date(selectedUser.last_sign_in_at)}</strong></div>
          </div></section>

          <section className="user-detail-section"><h3>{language === 'ar' ? 'بيانات البروفايل' : 'Profile information'}</h3><div className="user-detail-grid">
            <div className="user-data-cell"><span>{language === 'ar' ? 'الاسم الكامل' : 'Full name'}</span><strong>{profile?.full_name || '—'}</strong></div>
            <div className="user-data-cell"><span>{language === 'ar' ? 'الجامعة' : 'University'}</span><strong>{profile?.university || '—'}</strong></div>
            <div className="user-data-cell"><span>{language === 'ar' ? 'القسم' : 'Department'}</span><strong>{profile?.department || '—'}</strong></div>
            <div className="user-data-cell"><span>{language === 'ar' ? 'المستوى' : 'Level'}</span><strong>{profile?.level || '—'}</strong></div>
            <div className="user-data-cell wide"><span>{language === 'ar' ? 'النبذة' : 'Bio'}</span><p>{profile?.bio || '—'}</p></div>
          </div></section>

          <section className="user-detail-section"><h3>{language === 'ar' ? 'نشاط المستخدم' : 'User activity'}</h3><div className="user-detail-grid">
            <div className="user-data-cell"><span>{language === 'ar' ? 'التسجيلات' : 'Registrations'}</span><strong>{selectedUser.activity.registrations}</strong></div>
            <div className="user-data-cell"><span>{language === 'ar' ? 'التقييمات' : 'Ratings'}</span><strong>{selectedUser.activity.feedback}</strong></div>
            <div className="user-data-cell"><span>{language === 'ar' ? 'فيديوهات بدأها' : 'Videos started'}</span><strong>{selectedUser.activity.video_progress}</strong></div>
          </div>
          {!selectedUser.super_admin && <div className="user-detail-actions">{selectedUser.role === 'admin'
            ? <button className="button user-action user-action-demote" disabled={busyUsers} onClick={() => void manageUser(selectedUser.id, 'set_role', 'student')}><Icon name="shield" />{t('admin.demote')}</button>
            : <button className="button user-action user-action-promote" disabled={busyUsers} onClick={() => void manageUser(selectedUser.id, 'set_role', 'admin')}><Icon name="shield" />{t('admin.promote')}</button>}
            {banned ? <button className="button user-action user-action-enable" disabled={busyUsers} onClick={() => void manageUser(selectedUser.id, 'unban')}><Icon name="check" />{t('admin.enable')}</button> : <button className="button user-action user-action-disable" disabled={busyUsers} onClick={() => void manageUser(selectedUser.id, 'ban')}><Icon name="error" />{t('admin.disable')}</button>}</div>}
          </section>
        </aside>
      </div>
    })()}
  </section>
}
