import { useEffect, useMemo, useState, type FormEvent } from 'react'
import { supabase } from '../lib/supabase'
import { StatCard } from '../components/StatCard'
import type { Category, Profile, Session, SessionSeries, SessionVideo, Speaker } from '../types/domain'
import { errorMessage } from '../lib/errors'
import { extractYouTubeVideoId } from '../lib/youtube'
import { YouTubePlayer } from '../components/YouTubePlayer'
import { useUi } from '../hooks/useUi'
import { useAuth } from '../hooks/useAuth'
import { useToast } from '../components/ToastProvider'
import { Icon } from '../components/Icon'

type RegistrationAnalytics = { user_id: string; session_id: string; attendance_status: string; session: { category_id: string | null; speaker_id: string | null } | null }
type FeedbackAnalytics = { user_id: string; session_id: string; rating: number; session: { category_id: string | null; speaker_id: string | null } | null }
type ViewAnalytics = { user_id: string; session_id: string }
type ProgressAnalytics = { user_id: string; video_id: string; video: { session_id: string } | null }
type ManagedUser = { id: string; email: string; full_name: string; role: 'admin' | 'student'; super_admin: boolean; banned_until: string | null; created_at: string; last_sign_in_at: string | null; activity: { registrations: number; feedback: number; video_progress: number } }

function rankedEntries(values: Map<string, number>, labels: Map<string, string>, limit = 5) {
  return [...values.entries()].map(([id, value]) => ({ id, value, label: labels.get(id) ?? id })).sort((a, b) => b.value - a.value).slice(0, limit)
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
    setBusyUsers(true)
    try { const { data, error } = await supabase.functions.invoke('manage-users', { body: { action, user_id: userId, role } }); if (error) throw error; const payload = data as { error?: string }; if (payload.error) throw new Error(payload.error); success(language === 'ar' ? 'تم تحديث صلاحية المستخدم.' : 'User access updated.'); await loadManagedUsers() } catch (error) { fail(error) } finally { setBusyUsers(false) }
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

  const maxRanking = Math.max(1, ...analytics.categories.map((item) => item.value), ...analytics.speakers.map((item) => item.value))

  return <section className="admin-page-v2">
    <div className="section-heading"><div><div className="eyebrow">{t('admin.eyebrow')}</div><h1>{t('admin.title')}</h1><p>{t('admin.subtitle')}</p></div></div>
    <div className="stats-grid stats-grid-v2"><StatCard label={t('admin.users')} value={profiles.length} /><StatCard label={t('admin.sessions')} value={sessions.length} /><StatCard label={t('admin.registrations')} value={registrations.length} /><StatCard label={t('admin.speakers')} value={speakers.length} /></div>

    <section className="panel section-gap admin-section"><div className="admin-section-heading"><div><span className="eyebrow">{t('admin.analytics')}</span><h2>{t('admin.analytics')}</h2></div><Icon name="chart" /></div>
      <div className="analytics-kpis"><div><span>{t('admin.views')}</span><strong>{viewRows.length}</strong></div><div><span>{t('admin.attendanceRate')}</span><strong>{registrations.length ? Math.round(analytics.attended / registrations.length * 100) : 0}%</strong></div><div><span>{t('admin.avgRating')}</span><strong>{analytics.avgRating.toFixed(1)} / 5</strong></div><div><span>{t('admin.videoStarts')}</span><strong>{progressRows.length}</strong></div><div><span>{t('admin.conversion')}</span><strong>{Math.round(analytics.conversion)}%</strong></div></div>
      <div className="analytics-grid">
        <div><h3>{t('admin.topCategories')}</h3>{analytics.categories.length ? analytics.categories.map((item) => <div className="ranking-row" key={item.id}><span>{item.label}</span><i><b style={{ width: `${item.value / maxRanking * 100}%` }} /></i><strong>{item.value}</strong></div>) : <div className="empty-state">—</div>}</div>
        <div><h3>{t('admin.topSpeakers')}</h3>{analytics.speakers.length ? analytics.speakers.map((item) => <div className="ranking-row" key={item.id}><span>{item.label}</span><i><b style={{ width: `${item.value / maxRanking * 100}%` }} /></i><strong>{item.value}</strong></div>) : <div className="empty-state">—</div>}</div>
        <div><h3>{t('admin.activeStudents')}</h3>{analytics.students.length ? analytics.students.map((item, index) => <div className="student-rank" key={item.id}><em>{index + 1}</em><span>{item.label}</span><strong>{item.value}</strong></div>) : <div className="empty-state">—</div>}</div>
      </div>
    </section>

    {isSuperAdmin && <section className="panel section-gap admin-section"><div className="admin-section-heading"><div><span className="eyebrow">{t('admin.superAdmin')}</span><h2>{t('admin.userManagement')}</h2><p>{t('admin.superOnly')}</p></div><Icon name="users" /></div>
      <div className="user-management-list">{managedUsers.map((account) => {
        const banned = Boolean(account.banned_until && new Date(account.banned_until).getTime() > Date.now())
        return <article className="user-management-row" key={account.id}><div className="user-identity"><span className="sidebar-user-avatar">{(account.full_name || account.email || 'U').slice(0, 1).toUpperCase()}</span><span><strong>{account.full_name || account.email}</strong><small>{account.email}</small></span></div><div className="user-role"><span className={`role-pill ${account.super_admin ? 'super' : account.role}`}>{account.super_admin ? t('admin.superAdmin') : account.role === 'admin' ? t('admin.roleAdmin') : t('admin.roleStudent')}</span>{banned && <span className="role-pill banned">{language === 'ar' ? 'معطّل' : 'Disabled'}</span>}</div><div className="user-activity"><small>{t('admin.activity')}</small><span>{account.activity.registrations} · {account.activity.feedback} · {account.activity.video_progress}</span></div><div className="user-last"><small>{t('admin.lastSignIn')}</small><span>{account.last_sign_in_at ? new Intl.DateTimeFormat(locale, { dateStyle: 'medium' }).format(new Date(account.last_sign_in_at)) : '—'}</span></div><div className="row-actions">{!account.super_admin && <>{account.role === 'admin' ? <button disabled={busyUsers} onClick={() => void manageUser(account.id, 'set_role', 'student')}>{t('admin.demote')}</button> : <button disabled={busyUsers} onClick={() => void manageUser(account.id, 'set_role', 'admin')}>{t('admin.promote')}</button>}{banned ? <button disabled={busyUsers} onClick={() => void manageUser(account.id, 'unban')}>{t('admin.enable')}</button> : <button className="danger-link" disabled={busyUsers} onClick={() => void manageUser(account.id, 'ban')}>{t('admin.disable')}</button>}</>}</div></article>
      })}{busyUsers && !managedUsers.length && <div className="page-state">{t('common.loading')}</div>}</div>
    </section>}

    <section className="panel section-gap admin-section"><div className="admin-section-heading"><div><span className="eyebrow">{t('admin.series')}</span><h2>{t('admin.series')}</h2></div><Icon name="layers" /></div>
      <form className="series-form" onSubmit={(event) => void addSeries(event)}><input name="title" placeholder={t('admin.seriesTitle')} required /><input name="description" placeholder={t('admin.seriesDescription')} /><button className="button button-primary">{t('admin.createSeries')}</button></form>
      <div className="admin-list">{series.map((item) => <div key={item.id}><span><strong>{item.title}</strong>{item.description && <small>{item.description}</small>}</span><div><button onClick={() => { const title = window.prompt(t('admin.seriesTitle'), item.title); if (title?.trim()) void run(() => supabase.from('session_series').update({ title: title.trim() }).eq('id', item.id), language === 'ar' ? 'تم تحديث السلسلة.' : 'Series updated.') }}>{t('common.edit')}</button><button className="danger-link" onClick={() => { if (window.confirm(t('common.delete'))) void run(() => supabase.from('session_series').delete().eq('id', item.id), language === 'ar' ? 'تم حذف السلسلة.' : 'Series deleted.') }}>{t('common.delete')}</button></div></div>)}</div>
    </section>

    <div className="admin-grid section-gap"><section className="panel"><h2>{t('admin.category')}</h2><form className="inline-form" onSubmit={(event) => void addCategory(event)}><input name="name" placeholder={t('admin.name')} required /><input name="slug" placeholder="slug" required /><button className="button button-primary">{t('common.add')}</button></form><div className="admin-list">{categories.map((category) => <div key={category.id}><span>{category.name}</span><div><button onClick={() => { const name = window.prompt(t('admin.name'), category.name); if (name) void run(() => supabase.from('categories').update({ name }).eq('id', category.id), language === 'ar' ? 'تم تحديث التصنيف.' : 'Category updated.') }}>{t('common.edit')}</button><button className="danger-link" onClick={() => void run(() => supabase.from('categories').delete().eq('id', category.id), language === 'ar' ? 'تم حذف التصنيف.' : 'Category deleted.')}>{t('common.delete')}</button></div></div>)}</div></section>
      <section className="panel"><h2>{t('admin.speakers')}</h2><form className="inline-form" onSubmit={(event) => void addSpeaker(event)}><input name="name" placeholder={t('admin.name')} required /><input name="organization" placeholder={t('admin.organization')} /><button className="button button-primary">{t('common.add')}</button></form><div className="admin-list">{speakers.map((speaker) => <div key={speaker.id}><span>{speaker.name}</span><div className="row-actions"><label className="file-action">{language === 'ar' ? 'صورة' : 'Photo'}<input type="file" accept="image/*" onChange={(event) => event.target.files?.[0] && void uploadSpeakerImage(speaker, event.target.files[0])} /></label><button onClick={() => { const name = window.prompt(t('admin.name'), speaker.name); if (name) void run(() => supabase.from('speakers').update({ name }).eq('id', speaker.id), language === 'ar' ? 'تم تحديث المتحدث.' : 'Speaker updated.') }}>{t('common.edit')}</button><button className="danger-link" onClick={() => void run(() => supabase.from('speakers').delete().eq('id', speaker.id), language === 'ar' ? 'تم حذف المتحدث.' : 'Speaker deleted.')}>{t('common.delete')}</button></div></div>)}</div></section></div>

    <section className="panel section-gap admin-section"><h2>{t('admin.sessions')}</h2><form className="session-admin-form" onSubmit={(event) => void addSession(event)}><input name="title" placeholder={t('admin.titleField')} required /><input name="slug" placeholder="slug" required /><textarea name="description" placeholder={t('admin.description')} required /><input name="starts_at" type="datetime-local" required /><input name="capacity" type="number" min="1" defaultValue="30" required /><select name="category_id"><option value="">{t('admin.noCategory')}</option>{categories.map((item) => <option key={item.id} value={item.id}>{item.name}</option>)}</select><select name="speaker_id"><option value="">{t('admin.noSpeaker')}</option>{speakers.map((item) => <option key={item.id} value={item.id}>{item.name}</option>)}</select><select name="series_id"><option value="">{t('admin.noSeries')}</option>{series.map((item) => <option key={item.id} value={item.id}>{item.title}</option>)}</select><input name="series_position" type="number" min="1" defaultValue="1" placeholder={t('admin.seriesPosition')} /><button className="button button-primary">{t('admin.createSession')}</button></form>
      <div className="admin-list session-admin-list">{sessions.map((session) => <div key={session.id}><span><strong>{session.title}</strong><small>{new Intl.DateTimeFormat(locale, { dateStyle: 'medium' }).format(new Date(session.starts_at))}</small></span><div className="session-series-inline"><select aria-label={t('admin.series')} value={session.series_id ?? ''} onChange={(event) => void run(() => supabase.from('sessions').update({ series_id: event.target.value || null, series_position: event.target.value ? session.series_position ?? 1 : null }).eq('id', session.id), language === 'ar' ? 'تم تحديث السلسلة.' : 'Series assignment updated.')}><option value="">{t('admin.noSeries')}</option>{series.map((item) => <option key={item.id} value={item.id}>{item.title}</option>)}</select>{session.series_id && <input aria-label={t('admin.seriesPosition')} type="number" min="1" defaultValue={session.series_position ?? 1} onBlur={(event) => void run(() => supabase.from('sessions').update({ series_position: Number(event.target.value || 1) }).eq('id', session.id), language === 'ar' ? 'تم تحديث رقم الجزء.' : 'Part number updated.')} />}</div><div className="row-actions"><label className="file-action">{t('admin.cover')}<input type="file" accept="image/*" onChange={(event) => event.target.files?.[0] && void uploadSessionCover(session, event.target.files[0])} /></label><label className="file-action">{t('admin.resource')}<input type="file" onChange={(event) => event.target.files?.[0] && void uploadSessionResource(session, event.target.files[0])} /></label><button onClick={() => { const title = window.prompt(t('admin.titleField'), session.title); if (title) void run(() => supabase.from('sessions').update({ title }).eq('id', session.id), language === 'ar' ? 'تم تحديث السيشن.' : 'Session updated.') }}>{t('common.edit')}</button><button className="danger-link" onClick={() => { if (window.confirm(t('common.delete'))) void run(() => supabase.from('sessions').delete().eq('id', session.id), language === 'ar' ? 'تم حذف السيشن.' : 'Session deleted.') }}>{t('common.delete')}</button></div></div>)}</div>
    </section>

    <section className="panel section-gap video-admin-panel"><div className="video-admin-heading"><div><div className="eyebrow">YouTube</div><h2>{t('admin.youtube')}</h2><p>{t('admin.youtubeHint')}</p></div><span className="video-admin-note">{language === 'ar' ? 'Public أو Unlisted + Embed مسموح' : 'Public or Unlisted + embedding allowed'}</span></div><div className="video-admin-layout"><form className="video-admin-form" onSubmit={(event) => void addSessionVideo(event)}><label>{t('admin.videoSession')}<select value={videoSessionId} onChange={(event) => setVideoSessionId(event.target.value)} required><option value="">{t('admin.videoSession')}</option>{sessions.map((session) => <option key={session.id} value={session.id}>{session.title}</option>)}</select></label><label>{t('admin.videoTitle')}<input value={videoTitle} onChange={(event) => setVideoTitle(event.target.value)} required /></label><label className="wide">{t('admin.youtubeUrl')}<input value={videoUrl} onChange={(event) => setVideoUrl(event.target.value)} inputMode="url" required /></label><button className="button button-primary wide">{t('admin.addRecording')}</button></form><div className="video-preview">{extractYouTubeVideoId(videoUrl) ? <><span>{t('admin.preview')}</span><YouTubePlayer videoId={extractYouTubeVideoId(videoUrl)!} title={videoTitle || t('admin.preview')} /></> : <div className="video-preview-empty"><strong>{t('admin.preview')}</strong><span>{language === 'ar' ? 'الصق رابط YouTube صالحًا لرؤية المعاينة.' : 'Paste a valid YouTube URL to preview it.'}</span></div>}</div></div><div className="admin-list video-admin-list">{videos.map((video) => <div key={video.id}><span><strong>{video.title}</strong><small>{sessions.find((item) => item.id === video.session_id)?.title ?? '—'}</small></span><div><button onClick={() => { const title = window.prompt(t('admin.videoTitle'), video.title); if (title?.trim()) void run(() => supabase.from('session_videos').update({ title: title.trim() }).eq('id', video.id), language === 'ar' ? 'تم تحديث التسجيل.' : 'Recording updated.') }}>{t('common.edit')}</button><button className="danger-link" onClick={() => void run(() => supabase.from('session_videos').delete().eq('id', video.id), language === 'ar' ? 'تم حذف التسجيل.' : 'Recording deleted.')}>{t('common.delete')}</button></div></div>)}</div></section>

    <section className="panel section-gap notification-admin-panel"><h2>{t('admin.push')}</h2><form className="notification-form" onSubmit={(event) => void sendNotification(event)}><input name="title" placeholder={t('admin.pushTitle')} required /><textarea name="body" placeholder={t('admin.pushBody')} required /><input name="url" placeholder="/sessions/..." defaultValue="/" /><button className="button button-primary">{t('admin.sendPush')}</button></form></section>
  </section>
}
