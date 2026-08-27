import { useEffect, useMemo, useState, type FormEvent, type ReactNode } from 'react'
import { publicStorageUrl, supabase } from '../lib/supabase'
import { StatCard } from '../components/StatCard'
import { Icon } from '../components/Icon'
import { StarRating } from '../components/StarRating'
import { YouTubePlayer } from '../components/YouTubePlayer'
import { ConfirmDialog } from '../components/ConfirmDialog'
import { extractYouTubeVideoId } from '../lib/youtube'
import { errorMessage } from '../lib/errors'
import { useAuth } from '../hooks/useAuth'
import { useToast } from '../components/ToastProvider'
import { useUi } from '../hooks/useUi'
import type { Category, Profile, Session, SessionSeries, SessionVideo, Speaker } from '../types/domain'

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

type EditTarget =
  | { kind: 'category'; item: Category }
  | { kind: 'speaker'; item: Speaker }
  | { kind: 'series'; item: SessionSeries }
  | { kind: 'session'; item: Session }
  | { kind: 'video'; item: SessionVideo }

type ConfirmState = {
  title: string
  description: string
  confirmLabel: string
  tone: 'danger' | 'warning' | 'primary'
  action: () => Promise<void>
} | null

function Field({ label, children, wide = false, hint }: { label: string; children: ReactNode; wide?: boolean; hint?: string }) {
  return <label className={`form-field ${wide ? 'wide' : ''}`}><span className="field-label">{label}</span>{children}{hint && <span className="field-hint">{hint}</span>}</label>
}

function toLocalInput(value: string | null) {
  if (!value) return ''
  const date = new Date(value)
  const offset = date.getTimezoneOffset() * 60000
  return new Date(date.getTime() - offset).toISOString().slice(0, 16)
}

function rankedEntries(values: Map<string, number>, labels: Map<string, string>, limit = 5) {
  return [...values.entries()].map(([id, value]) => ({ id, value, label: labels.get(id) ?? id })).sort((a, b) => b.value - a.value).slice(0, limit)
}

export function AdminPageV3() {
  const { language, locale, t } = useUi()
  const { isSuperAdmin } = useAuth()
  const { showToast } = useToast()
  const ar = language === 'ar'

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
  const [busyUsers, setBusyUsers] = useState(false)
  const [userSearch, setUserSearch] = useState('')
  const [selectedUserId, setSelectedUserId] = useState<string | null>(null)
  const [editTarget, setEditTarget] = useState<EditTarget | null>(null)
  const [confirmState, setConfirmState] = useState<ConfirmState>(null)
  const [confirmBusy, setConfirmBusy] = useState(false)
  const [editorBusy, setEditorBusy] = useState(false)
  const [videoSessionId, setVideoSessionId] = useState('')
  const [videoTitle, setVideoTitle] = useState('')
  const [videoUrl, setVideoUrl] = useState('')

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
    setCategories((cat.data ?? []) as Category[])
    setSpeakers((spk.data ?? []) as Speaker[])
    setSessions((ses.data ?? []) as Session[])
    setSeries((ser.data ?? []) as SessionSeries[])
    setVideos((vid.data ?? []) as SessionVideo[])
    setProfiles((prof.data ?? []) as Profile[])
    setRegistrations((regs.data ?? []) as unknown as RegistrationAnalytics[])
    setFeedbackRows((feeds.data ?? []) as unknown as FeedbackAnalytics[])
    setViewRows((views.data ?? []) as ViewAnalytics[])
    setProgressRows((progress.data ?? []) as unknown as ProgressAnalytics[])
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
    const result = await task()
    if (result.error) throw result.error
    success(successMessage)
    await load()
  }

  function askConfirm(config: Exclude<ConfirmState, null>) { setConfirmState(config) }

  async function confirmNow() {
    if (!confirmState) return
    setConfirmBusy(true)
    try { await confirmState.action(); setConfirmState(null) }
    catch (error) { fail(error) }
    finally { setConfirmBusy(false) }
  }

  async function addCategory(event: FormEvent<HTMLFormElement>) {
    event.preventDefault(); const formEl = event.currentTarget; const form = new FormData(formEl)
    try {
      await run(() => supabase.from('categories').insert({ name: String(form.get('name') || '').trim(), slug: String(form.get('slug') || '').trim(), description: String(form.get('description') || '').trim() || null }), ar ? 'تمت إضافة التصنيف.' : 'Category added.')
      formEl.reset()
    } catch (error) { fail(error) }
  }

  async function addSpeaker(event: FormEvent<HTMLFormElement>) {
    event.preventDefault(); const formEl = event.currentTarget; const form = new FormData(formEl)
    try {
      await run(() => supabase.from('speakers').insert({ name: String(form.get('name') || '').trim(), organization: String(form.get('organization') || '').trim() || null, bio: String(form.get('bio') || '').trim() || null }), ar ? 'تمت إضافة المتحدث.' : 'Speaker added.')
      formEl.reset()
    } catch (error) { fail(error) }
  }

  async function addSeries(event: FormEvent<HTMLFormElement>) {
    event.preventDefault(); const formEl = event.currentTarget; const form = new FormData(formEl)
    try {
      await run(() => supabase.from('session_series').insert({ title: String(form.get('title') || '').trim(), description: String(form.get('description') || '').trim() || null }), ar ? 'تم إنشاء السلسلة.' : 'Series created.')
      formEl.reset()
    } catch (error) { fail(error) }
  }

  async function addSession(event: FormEvent<HTMLFormElement>) {
    event.preventDefault(); const formEl = event.currentTarget; const form = new FormData(formEl)
    const seriesId = String(form.get('series_id') || '') || null
    try {
      await run(() => supabase.from('sessions').insert({
        title: String(form.get('title') || '').trim(), slug: String(form.get('slug') || '').trim(), description: String(form.get('description') || '').trim(),
        starts_at: new Date(String(form.get('starts_at'))).toISOString(), ends_at: String(form.get('ends_at') || '') ? new Date(String(form.get('ends_at'))).toISOString() : null,
        location: String(form.get('location') || '').trim() || null, capacity: Number(form.get('capacity') || 30),
        category_id: String(form.get('category_id') || '') || null, speaker_id: String(form.get('speaker_id') || '') || null,
        series_id: seriesId, series_position: seriesId ? Number(form.get('series_position') || 1) : null, status: String(form.get('status') || 'published') as 'draft' | 'published' | 'cancelled',
      }), ar ? 'تم إنشاء السيشن.' : 'Session created.')
      formEl.reset()
    } catch (error) { fail(error) }
  }

  async function addVideo(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    const youtubeId = extractYouTubeVideoId(videoUrl)
    if (!videoSessionId || !videoTitle.trim() || !youtubeId) { fail(new Error(ar ? 'اختاري السيشن واكتبي العنوان ورابط YouTube صالح.' : 'Choose a session, title, and valid YouTube URL.')); return }
    try {
      await run(() => supabase.from('session_videos').insert({ session_id: videoSessionId, title: videoTitle.trim(), youtube_video_id: youtubeId, position: videos.filter(v => v.session_id === videoSessionId).length }), ar ? 'تمت إضافة التسجيل.' : 'Recording added.')
      setVideoTitle(''); setVideoUrl('')
    } catch (error) { fail(error) }
  }

  async function sendNotification(event: FormEvent<HTMLFormElement>) {
    event.preventDefault(); const formEl = event.currentTarget; const form = new FormData(formEl)
    try {
      const { error } = await supabase.functions.invoke('send-session-notification', { body: { title: String(form.get('title') || '').trim(), body: String(form.get('body') || '').trim(), url: String(form.get('url') || '').trim() || '/' } })
      if (error) throw error
      success(ar ? 'تم إرسال الإشعار.' : 'Notification sent.')
      formEl.reset()
    } catch (error) { fail(error) }
  }

  async function uploadSpeakerImage(speaker: Speaker, file: File) {
    const ext = file.name.split('.').pop()?.toLowerCase() || 'jpg'; const path = `${speaker.id}/photo.${ext}`
    const { error: uploadError } = await supabase.storage.from('speaker-images').upload(path, file, { upsert: true }); if (uploadError) throw uploadError
    const { error } = await supabase.from('speakers').update({ image_path: path }).eq('id', speaker.id); if (error) throw error
  }

  async function uploadSessionCover(session: Session, file: File) {
    const ext = file.name.split('.').pop()?.toLowerCase() || 'jpg'; const path = `${session.id}/cover.${ext}`
    const { error: uploadError } = await supabase.storage.from('session-covers').upload(path, file, { upsert: true }); if (uploadError) throw uploadError
    const { error } = await supabase.from('sessions').update({ cover_path: path }).eq('id', session.id); if (error) throw error
  }

  async function uploadResource(session: Session, file: File) {
    const safe = file.name.replace(/[^a-zA-Z0-9._-]/g, '-'); const path = `${session.id}/${Date.now()}-${safe}`
    const { error: uploadError } = await supabase.storage.from('session-resources').upload(path, file); if (uploadError) throw uploadError
    const { error } = await supabase.from('session_resources').insert({ session_id: session.id, title: file.name, file_path: path }); if (error) throw error
    success(ar ? 'تم رفع الملف.' : 'Resource uploaded.')
  }

  async function saveEdit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault(); if (!editTarget) return
    const form = new FormData(event.currentTarget); setEditorBusy(true)
    try {
      if (editTarget.kind === 'category') {
        await run(() => supabase.from('categories').update({ name: String(form.get('name') || '').trim(), slug: String(form.get('slug') || '').trim(), description: String(form.get('description') || '').trim() || null }).eq('id', editTarget.item.id), ar ? 'تم حفظ التصنيف.' : 'Category saved.')
      }
      if (editTarget.kind === 'speaker') {
        await run(() => supabase.from('speakers').update({ name: String(form.get('name') || '').trim(), organization: String(form.get('organization') || '').trim() || null, bio: String(form.get('bio') || '').trim() || null }).eq('id', editTarget.item.id), ar ? 'تم حفظ بيانات المتحدث.' : 'Speaker saved.')
        const image = form.get('image')
        if (image instanceof File && image.size) { await uploadSpeakerImage(editTarget.item, image); await load() }
      }
      if (editTarget.kind === 'series') {
        await run(() => supabase.from('session_series').update({ title: String(form.get('title') || '').trim(), description: String(form.get('description') || '').trim() || null, published: form.get('published') === 'on' }).eq('id', editTarget.item.id), ar ? 'تم حفظ السلسلة.' : 'Series saved.')
      }
      if (editTarget.kind === 'session') {
        const seriesId = String(form.get('series_id') || '') || null
        await run(() => supabase.from('sessions').update({
          title: String(form.get('title') || '').trim(), slug: String(form.get('slug') || '').trim(), description: String(form.get('description') || '').trim(),
          starts_at: new Date(String(form.get('starts_at'))).toISOString(), ends_at: String(form.get('ends_at') || '') ? new Date(String(form.get('ends_at'))).toISOString() : null,
          location: String(form.get('location') || '').trim() || null, capacity: Number(form.get('capacity') || 1),
          category_id: String(form.get('category_id') || '') || null, speaker_id: String(form.get('speaker_id') || '') || null,
          series_id: seriesId, series_position: seriesId ? Number(form.get('series_position') || 1) : null,
          status: String(form.get('status') || 'draft') as 'draft' | 'published' | 'cancelled',
        }).eq('id', editTarget.item.id), ar ? 'تم حفظ السيشن.' : 'Session saved.')
        const cover = form.get('cover')
        if (cover instanceof File && cover.size) { await uploadSessionCover(editTarget.item, cover); await load() }
      }
      if (editTarget.kind === 'video') {
        const youtubeId = extractYouTubeVideoId(String(form.get('youtube_url') || ''))
        if (!youtubeId) throw new Error(ar ? 'رابط YouTube غير صالح.' : 'Invalid YouTube URL.')
        await run(() => supabase.from('session_videos').update({ session_id: String(form.get('session_id') || ''), title: String(form.get('title') || '').trim(), youtube_video_id: youtubeId, position: Number(form.get('position') || 0) }).eq('id', editTarget.item.id), ar ? 'تم حفظ التسجيل.' : 'Recording saved.')
      }
      setEditTarget(null)
    } catch (error) { fail(error) } finally { setEditorBusy(false) }
  }

  function requestDelete(target: EditTarget) {
    const labels = { category: ar ? 'التصنيف' : 'category', speaker: ar ? 'المتحدث' : 'speaker', series: ar ? 'السلسلة' : 'series', session: ar ? 'السيشن' : 'session', video: ar ? 'التسجيل' : 'recording' }
    const table = target.kind === 'series' ? 'session_series' : target.kind === 'video' ? 'session_videos' : target.kind === 'category' ? 'categories' : target.kind === 'speaker' ? 'speakers' : 'sessions'
    askConfirm({
      title: ar ? `حذف ${labels[target.kind]}؟` : `Delete ${labels[target.kind]}?`,
      description: ar ? 'الإجراء سيحذف العنصر من المنصة. راجعي اختيارك قبل المتابعة.' : 'This removes the item from the platform. Review your choice before continuing.',
      confirmLabel: ar ? 'نعم، احذف' : 'Delete', tone: 'danger',
      action: async () => { const { error } = await supabase.from(table).delete().eq('id', target.item.id); if (error) throw error; success(ar ? 'تم الحذف بنجاح.' : 'Deleted successfully.'); await load(); setEditTarget(null) },
    })
  }

  function requestUserAction(account: ManagedUser, action: 'set_role' | 'ban' | 'unban', role?: 'admin' | 'student') {
    const title = action === 'set_role' ? role === 'admin' ? (ar ? 'ترقية المستخدم إلى Admin؟' : 'Promote user to Admin?') : (ar ? 'سحب صلاحية Admin؟' : 'Remove Admin access?') : action === 'ban' ? (ar ? 'تعطيل الحساب؟' : 'Disable account?') : (ar ? 'إعادة تفعيل الحساب؟' : 'Enable account?')
    const description = action === 'set_role' ? role === 'admin' ? (ar ? 'سيحصل المستخدم على صلاحيات إدارة محتوى المنصة.' : 'The user will receive content administration permissions.') : (ar ? 'سيفقد المستخدم صلاحيات الإدارة ويعود كمستخدم عادي.' : 'The user will lose admin permissions and return to a regular user.') : action === 'ban' ? (ar ? 'لن يتمكن المستخدم من تسجيل الدخول حتى تعيدي تفعيل حسابه.' : 'The user will not be able to sign in until you enable the account again.') : (ar ? 'سيتمكن المستخدم من تسجيل الدخول مرة أخرى.' : 'The user will be able to sign in again.')
    askConfirm({ title, description, confirmLabel: action === 'ban' ? (ar ? 'تعطيل الحساب' : 'Disable') : action === 'unban' ? (ar ? 'تفعيل الحساب' : 'Enable') : role === 'admin' ? (ar ? 'ترقية إلى Admin' : 'Promote') : (ar ? 'سحب الصلاحية' : 'Remove access'), tone: action === 'ban' ? 'danger' : 'warning', action: async () => {
      setBusyUsers(true)
      try {
        const { data, error } = await supabase.functions.invoke('manage-users', { body: { action, user_id: account.id, role } })
        if (error) throw error
        const payload = data as { error?: string }; if (payload.error) throw new Error(payload.error)
        success(ar ? 'تم تحديث صلاحية المستخدم.' : 'User access updated.')
        await loadManagedUsers()
      } finally { setBusyUsers(false) }
    } })
  }

  const analytics = useMemo(() => {
    const attended = registrations.filter(row => row.attendance_status === 'attended').length
    const avgRating = feedbackRows.length ? feedbackRows.reduce((sum, row) => sum + row.rating, 0) / feedbackRows.length : 0
    const categoryCounts = new Map<string, number>(); const speakerCounts = new Map<string, number>(); const activity = new Map<string, number>()
    registrations.forEach(row => { if (row.session?.category_id) categoryCounts.set(row.session.category_id, (categoryCounts.get(row.session.category_id) ?? 0) + 1); if (row.session?.speaker_id) speakerCounts.set(row.session.speaker_id, (speakerCounts.get(row.session.speaker_id) ?? 0) + 1); activity.set(row.user_id, (activity.get(row.user_id) ?? 0) + 3) })
    feedbackRows.forEach(row => activity.set(row.user_id, (activity.get(row.user_id) ?? 0) + 2)); progressRows.forEach(row => activity.set(row.user_id, (activity.get(row.user_id) ?? 0) + 1))
    return { attended, avgRating, conversion: viewRows.length ? Math.min(100, registrations.length / viewRows.length * 100) : 0, categories: rankedEntries(categoryCounts, new Map(categories.map(i => [i.id, i.name]))), speakers: rankedEntries(speakerCounts, new Map(speakers.map(i => [i.id, i.name]))), students: rankedEntries(activity, new Map(profiles.map(i => [i.id, i.full_name]))) }
  }, [registrations, feedbackRows, viewRows, progressRows, categories, speakers, profiles])

  const filteredUsers = useMemo(() => {
    const q = userSearch.trim().toLowerCase(); if (!q) return managedUsers
    return managedUsers.filter(a => [a.full_name, a.email, a.phone, a.profile?.university, a.profile?.department, a.profile?.level].filter(Boolean).some(v => String(v).toLowerCase().includes(q)))
  }, [managedUsers, userSearch])
  const selectedUser = selectedUserId ? managedUsers.find(a => a.id === selectedUserId) ?? null : null
  const maxRanking = Math.max(1, ...analytics.categories.map(i => i.value), ...analytics.speakers.map(i => i.value))
  const date = (value: string | null) => value ? new Intl.DateTimeFormat(locale, { dateStyle: 'medium', timeStyle: 'short' }).format(new Date(value)) : '—'

  return <section className="admin-page-v2">
    <div className="section-heading"><div><div className="eyebrow">{t('admin.eyebrow')}</div><h1>{t('admin.title')}</h1><p>{t('admin.subtitle')}</p></div></div>
    <div className="stats-grid stats-grid-v2"><StatCard label={t('admin.users')} value={profiles.length} /><StatCard label={t('admin.sessions')} value={sessions.length} /><StatCard label={t('admin.registrations')} value={registrations.length} /><StatCard label={t('admin.speakers')} value={speakers.length} /></div>

    <section className="panel section-gap admin-section"><div className="admin-v3-section-head"><div><h2>{t('admin.analytics')}</h2><p>{ar ? 'نظرة سريعة على أداء المنصة.' : 'A quick view of platform performance.'}</p></div><Icon name="chart" /></div>
      <div className="analytics-kpis"><div><span>{t('admin.views')}</span><strong>{viewRows.length}</strong></div><div><span>{t('admin.attendanceRate')}</span><strong>{registrations.length ? Math.round(analytics.attended / registrations.length * 100) : 0}%</strong></div><div className="rating-kpi"><span>{t('admin.avgRating')}</span><strong><StarRating value={analytics.avgRating} label={t('admin.avgRating')} readOnly /></strong></div><div><span>{t('admin.videoStarts')}</span><strong>{progressRows.length}</strong></div><div><span>{t('admin.conversion')}</span><strong>{Math.round(analytics.conversion)}%</strong></div></div>
      <div className="analytics-grid"><div><h3>{t('admin.topCategories')}</h3>{analytics.categories.map(item => <div className="ranking-row" key={item.id}><span>{item.label}</span><i><b style={{ width: `${item.value / maxRanking * 100}%` }} /></i><strong>{item.value}</strong></div>)}</div><div><h3>{t('admin.topSpeakers')}</h3>{analytics.speakers.map(item => <div className="ranking-row" key={item.id}><span>{item.label}</span><i><b style={{ width: `${item.value / maxRanking * 100}%` }} /></i><strong>{item.value}</strong></div>)}</div><div><h3>{t('admin.activeStudents')}</h3>{analytics.students.map((item, index) => <div className="student-rank" key={item.id}><em>{index + 1}</em><span>{item.label}</span><strong>{item.value}</strong></div>)}</div></div>
    </section>

    {isSuperAdmin && <section className="panel section-gap admin-section"><div className="admin-v3-section-head"><div><h2>{t('admin.userManagement')}</h2><p>{t('admin.superOnly')}</p></div><Icon name="users" /></div>
      <div className="user-directory-toolbar"><Field label={ar ? 'البحث في حسابات المستخدمين' : 'Search user accounts'}><input value={userSearch} onChange={e => setUserSearch(e.target.value)} placeholder={ar ? 'الاسم، الإيميل، الجامعة أو القسم…' : 'Name, email, university, or department…'} /></Field><span className="user-result-count">{filteredUsers.length}</span></div>
      <div className="user-management-list">{filteredUsers.map(account => { const banned = Boolean(account.banned_until && new Date(account.banned_until).getTime() > Date.now()); const displayName = account.profile?.full_name || account.full_name || account.email; return <article className="user-management-row" key={account.id}><div className="user-identity"><span className="sidebar-user-avatar">{displayName.slice(0,1).toUpperCase()}</span><span><strong>{displayName}</strong><small>{account.email}</small></span></div><div className="user-role"><span className={`role-pill ${account.super_admin ? 'super' : account.role}`}>{account.super_admin ? t('admin.superAdmin') : account.role === 'admin' ? t('admin.roleAdmin') : t('admin.roleStudent')}</span>{banned && <span className="role-pill banned">{ar ? 'معطّل' : 'Disabled'}</span>}</div><div className="user-activity"><small>{t('admin.activity')}</small><span>{account.activity.registrations} · {account.activity.feedback} · {account.activity.video_progress}</span></div><div className="user-management-actions"><button className="button user-action user-action-view" onClick={() => setSelectedUserId(account.id)}><Icon name="user" />{ar ? 'عرض التفاصيل' : 'View details'}</button>{!account.super_admin && (account.role === 'admin' ? <button className="button user-action user-action-demote" disabled={busyUsers} onClick={() => requestUserAction(account, 'set_role', 'student')}><Icon name="shield" />{t('admin.demote')}</button> : <button className="button user-action user-action-promote" disabled={busyUsers} onClick={() => requestUserAction(account, 'set_role', 'admin')}><Icon name="shield" />{t('admin.promote')}</button>)}</div></article> })}</div>
    </section>}

    <section className="panel section-gap admin-section"><div className="admin-v3-section-head"><div><h2>{t('admin.series')}</h2><p>{ar ? 'إنشاء وتعديل قوائم السيشنات المرتبطة.' : 'Create and edit connected session playlists.'}</p></div><Icon name="layers" /></div>
      <form className="admin-form-grid" onSubmit={e => void addSeries(e)}><Field label={t('admin.seriesTitle')}><input name="title" required /></Field><Field label={t('admin.seriesDescription')}><input name="description" /></Field><button className="button button-primary">{t('admin.createSeries')}</button></form>
      <div className="admin-v3-list">{series.map(item => <div className="admin-v3-item" key={item.id}><div className="admin-v3-item-copy"><strong>{item.title}</strong><small>{item.description || (ar ? 'بدون وصف' : 'No description')}</small></div><div className="admin-v3-actions"><button className="button button-ghost" onClick={() => setEditTarget({ kind:'series', item })}>{t('common.edit')}</button><button className="button danger" onClick={() => requestDelete({ kind:'series', item })}>{t('common.delete')}</button></div></div>)}</div>
    </section>

    <div className="admin-grid section-gap">
      <section className="panel"><div className="admin-v3-section-head"><div><h2>{t('admin.category')}</h2><p>{ar ? 'التصنيفات المستخدمة في البحث.' : 'Categories used in discovery.'}</p></div></div><form className="admin-form-grid" onSubmit={e => void addCategory(e)}><Field label={t('admin.name')}><input name="name" required /></Field><Field label="Slug"><input name="slug" placeholder="web-development" required /></Field><Field label={ar ? 'الوصف' : 'Description'} wide><textarea name="description" rows={2} /></Field><button className="button button-primary">{t('common.add')}</button></form><div className="admin-v3-list">{categories.map(item => <div className="admin-v3-item" key={item.id}><div className="admin-v3-item-copy"><strong>{item.name}</strong><small>{item.slug}</small></div><div className="admin-v3-actions"><button className="button button-ghost" onClick={() => setEditTarget({ kind:'category', item })}>{t('common.edit')}</button><button className="button danger" onClick={() => requestDelete({ kind:'category', item })}>{t('common.delete')}</button></div></div>)}</div></section>
      <section className="panel"><div className="admin-v3-section-head"><div><h2>{t('admin.speakers')}</h2><p>{ar ? 'بيانات المتحدثين وجهاتهم.' : 'Speaker profiles and affiliations.'}</p></div></div><form className="admin-form-grid" onSubmit={e => void addSpeaker(e)}><Field label={t('admin.name')}><input name="name" required /></Field><Field label={ar ? 'الجامعة / الشركة / المؤسسة' : 'University / company / organization'}><input name="organization" /></Field><Field label={ar ? 'نبذة' : 'Bio'} wide><textarea name="bio" rows={2} /></Field><button className="button button-primary">{t('common.add')}</button></form><div className="admin-v3-list">{speakers.map(item => <div className="admin-v3-item" key={item.id}><div className="admin-v3-item-copy"><strong>{item.name}</strong><small>{item.organization || '—'}</small></div><div className="admin-v3-actions"><button className="button button-ghost" onClick={() => setEditTarget({ kind:'speaker', item })}>{t('common.edit')}</button><button className="button danger" onClick={() => requestDelete({ kind:'speaker', item })}>{t('common.delete')}</button></div></div>)}</div></section>
    </div>

    <section className="panel section-gap admin-section"><div className="admin-v3-section-head"><div><h2>{t('admin.sessions')}</h2><p>{ar ? 'كل بيانات السيشن قابلة للتعديل من شاشة واحدة.' : 'Edit every session field from one screen.'}</p></div><Icon name="calendar" /></div>
      <form className="admin-form-grid" onSubmit={e => void addSession(e)}><Field label={t('admin.titleField')}><input name="title" required /></Field><Field label="Slug"><input name="slug" required /></Field><Field label={t('admin.description')} wide><textarea name="description" required /></Field><Field label={ar ? 'البداية' : 'Starts'}><input name="starts_at" type="datetime-local" required /></Field><Field label={ar ? 'النهاية' : 'Ends'}><input name="ends_at" type="datetime-local" /></Field><Field label={ar ? 'المكان' : 'Location'}><input name="location" /></Field><Field label={ar ? 'السعة' : 'Capacity'}><input name="capacity" type="number" min="1" defaultValue="30" required /></Field><Field label={ar ? 'التصنيف' : 'Category'}><select name="category_id"><option value="">{t('admin.noCategory')}</option>{categories.map(i => <option key={i.id} value={i.id}>{i.name}</option>)}</select></Field><Field label={ar ? 'المتحدث' : 'Speaker'}><select name="speaker_id"><option value="">{t('admin.noSpeaker')}</option>{speakers.map(i => <option key={i.id} value={i.id}>{i.name}</option>)}</select></Field><Field label={t('admin.series')}><select name="series_id"><option value="">{t('admin.noSeries')}</option>{series.map(i => <option key={i.id} value={i.id}>{i.title}</option>)}</select></Field><Field label={t('admin.seriesPosition')}><input name="series_position" type="number" min="1" defaultValue="1" /></Field><Field label={ar ? 'الحالة' : 'Status'}><select name="status" defaultValue="published"><option value="draft">Draft</option><option value="published">Published</option><option value="cancelled">Cancelled</option></select></Field><button className="button button-primary">{t('admin.createSession')}</button></form>
      <div className="admin-v3-list">{sessions.map(item => <div className="admin-v3-item" key={item.id}><div className="admin-v3-item-copy"><strong>{item.title}</strong><small>{new Intl.DateTimeFormat(locale, { dateStyle:'medium', timeStyle:'short' }).format(new Date(item.starts_at))} · {item.location || (ar ? 'أونلاين' : 'Online')}</small></div><div className="admin-v3-actions"><label className="file-action">{t('admin.resource')}<input type="file" onChange={e => e.target.files?.[0] && void uploadResource(item, e.target.files[0]).catch(fail)} /></label><button className="button button-ghost" onClick={() => setEditTarget({ kind:'session', item })}>{t('common.edit')}</button><button className="button danger" onClick={() => requestDelete({ kind:'session', item })}>{t('common.delete')}</button></div></div>)}</div>
    </section>

    <section className="panel section-gap admin-section"><div className="admin-v3-section-head"><div><h2>{t('admin.youtube')}</h2><p>{t('admin.youtubeHint')}</p></div><Icon name="play" /></div><div className="video-admin-layout"><form className="video-admin-form" onSubmit={e => void addVideo(e)}><Field label={t('admin.videoSession')}><select value={videoSessionId} onChange={e => setVideoSessionId(e.target.value)} required><option value="">{t('admin.videoSession')}</option>{sessions.map(s => <option key={s.id} value={s.id}>{s.title}</option>)}</select></Field><Field label={t('admin.videoTitle')}><input value={videoTitle} onChange={e => setVideoTitle(e.target.value)} required /></Field><Field label={t('admin.youtubeUrl')} wide><input value={videoUrl} onChange={e => setVideoUrl(e.target.value)} required /></Field><button className="button button-primary wide">{t('admin.addRecording')}</button></form><div className="video-preview">{extractYouTubeVideoId(videoUrl) ? <YouTubePlayer videoId={extractYouTubeVideoId(videoUrl)!} title={videoTitle || 'Preview'} /> : <div className="video-preview-empty">{ar ? 'الصقي رابط YouTube لمعاينته.' : 'Paste a YouTube URL to preview.'}</div>}</div></div><div className="admin-v3-list section-gap">{videos.map(item => <div className="admin-v3-item" key={item.id}><div className="admin-v3-item-copy"><strong>{item.title}</strong><small>{sessions.find(s => s.id === item.session_id)?.title || '—'}</small></div><div className="admin-v3-actions"><button className="button button-ghost" onClick={() => setEditTarget({ kind:'video', item })}>{t('common.edit')}</button><button className="button danger" onClick={() => requestDelete({ kind:'video', item })}>{t('common.delete')}</button></div></div>)}</div></section>

    <section className="panel section-gap admin-section"><div className="admin-v3-section-head"><div><h2>{t('admin.push')}</h2><p>{ar ? 'إرسال إشعار للطلاب.' : 'Send an update to students.'}</p></div><Icon name="bell" /></div><form className="admin-form-grid" onSubmit={e => void sendNotification(e)}><Field label={t('admin.pushTitle')}><input name="title" required /></Field><Field label={ar ? 'الرابط داخل المنصة' : 'In-app URL'}><input name="url" defaultValue="/" /></Field><Field label={t('admin.pushBody')} wide><textarea name="body" required /></Field><button className="button button-primary">{t('admin.sendPush')}</button></form></section>

    {editTarget && <div className="editor-backdrop" onMouseDown={e => { if (e.currentTarget === e.target && !editorBusy) setEditTarget(null) }}><form className="admin-editor" onSubmit={e => void saveEdit(e)}>
      <div className="editor-head"><div><div className="eyebrow">{ar ? 'تعديل' : 'Edit'}</div><h2>{editTarget.kind === 'category' ? (ar ? 'تعديل التصنيف' : 'Edit category') : editTarget.kind === 'speaker' ? (ar ? 'تعديل المتحدث' : 'Edit speaker') : editTarget.kind === 'series' ? (ar ? 'تعديل السلسلة' : 'Edit series') : editTarget.kind === 'session' ? (ar ? 'تعديل السيشن' : 'Edit session') : (ar ? 'تعديل التسجيل' : 'Edit recording')}</h2><p>{ar ? 'عدّلي البيانات المطلوبة ثم احفظي التغييرات.' : 'Update any field you need, then save changes.'}</p></div><button type="button" className="editor-close" onClick={() => setEditTarget(null)}><Icon name="close" /></button></div>
      <div className="editor-body">
        {editTarget.kind === 'category' && <section className="editor-section"><h3>{ar ? 'بيانات التصنيف' : 'Category information'}</h3><div className="editor-grid"><Field label={t('admin.name')}><input name="name" defaultValue={editTarget.item.name} required /></Field><Field label="Slug"><input name="slug" defaultValue={editTarget.item.slug} required /></Field><Field label={ar ? 'الوصف' : 'Description'} wide><textarea name="description" rows={4} defaultValue={editTarget.item.description ?? ''} /></Field></div></section>}
        {editTarget.kind === 'speaker' && <><section className="editor-section"><h3>{ar ? 'بيانات المتحدث' : 'Speaker information'}</h3><div className="editor-grid"><Field label={t('admin.name')}><input name="name" defaultValue={editTarget.item.name} required /></Field><Field label={ar ? 'الجامعة / الشركة / المؤسسة' : 'University / company / organization'}><input name="organization" defaultValue={editTarget.item.organization ?? ''} /></Field><Field label={ar ? 'نبذة' : 'Bio'} wide><textarea name="bio" rows={5} defaultValue={editTarget.item.bio ?? ''} /></Field></div></section><section className="editor-section"><h3>{ar ? 'صورة المتحدث' : 'Speaker photo'}</h3><Field label={ar ? 'اختيار صورة جديدة' : 'Choose a new photo'}><input name="image" type="file" accept="image/*" /></Field></section></>}
        {editTarget.kind === 'series' && <section className="editor-section"><h3>{ar ? 'بيانات السلسلة' : 'Series information'}</h3><div className="editor-grid"><Field label={t('admin.seriesTitle')}><input name="title" defaultValue={editTarget.item.title} required /></Field><Field label={t('admin.seriesDescription')} wide><textarea name="description" rows={5} defaultValue={editTarget.item.description ?? ''} /></Field><label className="form-field"><span className="field-label">{ar ? 'النشر' : 'Publishing'}</span><span><input style={{ width:'auto' }} name="published" type="checkbox" defaultChecked={editTarget.item.published} /> {ar ? 'السلسلة منشورة' : 'Series is published'}</span></label></div></section>}
        {editTarget.kind === 'session' && <><section className="editor-section"><h3>{ar ? 'المحتوى الأساسي' : 'Core content'}</h3><div className="editor-grid"><Field label={t('admin.titleField')}><input name="title" defaultValue={editTarget.item.title} required /></Field><Field label="Slug"><input name="slug" defaultValue={editTarget.item.slug} required /></Field><Field label={t('admin.description')} wide><textarea name="description" rows={6} defaultValue={editTarget.item.description} required /></Field></div></section><section className="editor-section"><h3>{ar ? 'الوقت والمكان' : 'Time and place'}</h3><div className="editor-grid"><Field label={ar ? 'البداية' : 'Starts'}><input name="starts_at" type="datetime-local" defaultValue={toLocalInput(editTarget.item.starts_at)} required /></Field><Field label={ar ? 'النهاية' : 'Ends'}><input name="ends_at" type="datetime-local" defaultValue={toLocalInput(editTarget.item.ends_at)} /></Field><Field label={ar ? 'المكان' : 'Location'}><input name="location" defaultValue={editTarget.item.location ?? ''} /></Field><Field label={ar ? 'السعة' : 'Capacity'}><input name="capacity" type="number" min="1" defaultValue={editTarget.item.capacity} required /></Field></div></section><section className="editor-section"><h3>{ar ? 'التنظيم والنشر' : 'Organization and publishing'}</h3><div className="editor-grid"><Field label={ar ? 'التصنيف' : 'Category'}><select name="category_id" defaultValue={editTarget.item.category_id ?? ''}><option value="">{t('admin.noCategory')}</option>{categories.map(i => <option key={i.id} value={i.id}>{i.name}</option>)}</select></Field><Field label={ar ? 'المتحدث' : 'Speaker'}><select name="speaker_id" defaultValue={editTarget.item.speaker_id ?? ''}><option value="">{t('admin.noSpeaker')}</option>{speakers.map(i => <option key={i.id} value={i.id}>{i.name}</option>)}</select></Field><Field label={t('admin.series')}><select name="series_id" defaultValue={editTarget.item.series_id ?? ''}><option value="">{t('admin.noSeries')}</option>{series.map(i => <option key={i.id} value={i.id}>{i.title}</option>)}</select></Field><Field label={t('admin.seriesPosition')}><input name="series_position" type="number" min="1" defaultValue={editTarget.item.series_position ?? 1} /></Field><Field label={ar ? 'الحالة' : 'Status'}><select name="status" defaultValue={editTarget.item.status}><option value="draft">Draft</option><option value="published">Published</option><option value="cancelled">Cancelled</option></select></Field><Field label={ar ? 'غلاف جديد' : 'New cover'}><input name="cover" type="file" accept="image/*" /></Field></div></section></>}
        {editTarget.kind === 'video' && <section className="editor-section"><h3>{ar ? 'بيانات التسجيل' : 'Recording information'}</h3><div className="editor-grid"><Field label={t('admin.videoSession')}><select name="session_id" defaultValue={editTarget.item.session_id} required>{sessions.map(s => <option key={s.id} value={s.id}>{s.title}</option>)}</select></Field><Field label={t('admin.videoTitle')}><input name="title" defaultValue={editTarget.item.title} required /></Field><Field label={t('admin.youtubeUrl')} wide><input name="youtube_url" defaultValue={`https://youtu.be/${editTarget.item.youtube_video_id}`} required /></Field><Field label={ar ? 'الترتيب' : 'Position'}><input name="position" type="number" min="0" defaultValue={editTarget.item.position} /></Field></div></section>}
      </div>
      <div className="editor-actions"><button type="button" className="button button-ghost" disabled={editorBusy} onClick={() => setEditTarget(null)}>{ar ? 'إلغاء' : 'Cancel'}</button><button className="button button-primary" disabled={editorBusy}>{editorBusy ? (ar ? 'جارٍ الحفظ…' : 'Saving…') : (ar ? 'حفظ التغييرات' : 'Save changes')}</button></div>
    </form></div>}

    {selectedUser && (() => { const banned = Boolean(selectedUser.banned_until && new Date(selectedUser.banned_until).getTime() > Date.now()); const profile = selectedUser.profile; const avatar = publicStorageUrl('profile-images', profile?.avatar_path ?? null); return <div className="user-detail-backdrop" onMouseDown={e => { if (e.target === e.currentTarget) setSelectedUserId(null) }}><aside className="user-detail-drawer"><div className="user-detail-head"><div className="user-detail-identity">{avatar ? <img className="user-detail-avatar" src={avatar} alt="" /> : <span className="user-detail-avatar">{(profile?.full_name || selectedUser.full_name || selectedUser.email).slice(0,1).toUpperCase()}</span>}<div><h2>{profile?.full_name || selectedUser.full_name || selectedUser.email}</h2><p>{selectedUser.email}</p></div></div><button className="user-detail-close" onClick={() => setSelectedUserId(null)}><Icon name="close" /></button></div><section className="user-detail-section"><h3>{ar ? 'بيانات الحساب' : 'Account information'}</h3><div className="user-detail-grid"><div className="user-data-cell"><span>Email</span><strong>{selectedUser.email}</strong></div><div className="user-data-cell"><span>{ar ? 'تأكيد البريد' : 'Email confirmation'}</span><strong>{selectedUser.email_confirmed_at ? (ar ? 'مؤكد' : 'Confirmed') : (ar ? 'غير مؤكد' : 'Not confirmed')}</strong></div><div className="user-data-cell"><span>{ar ? 'الهاتف' : 'Phone'}</span><strong>{selectedUser.phone || '—'}</strong></div><div className="user-data-cell"><span>{ar ? 'الدور' : 'Role'}</span><strong>{selectedUser.super_admin ? 'Super Admin' : selectedUser.role}</strong></div><div className="user-data-cell"><span>ID</span><strong>{selectedUser.id}</strong></div><div className="user-data-cell"><span>{ar ? 'آخر دخول' : 'Last sign in'}</span><strong>{date(selectedUser.last_sign_in_at)}</strong></div></div></section><section className="user-detail-section"><h3>{ar ? 'البروفايل' : 'Profile'}</h3><div className="user-detail-grid"><div className="user-data-cell"><span>{ar ? 'الجامعة' : 'University'}</span><strong>{profile?.university || '—'}</strong></div><div className="user-data-cell"><span>{ar ? 'القسم' : 'Department'}</span><strong>{profile?.department || '—'}</strong></div><div className="user-data-cell"><span>{ar ? 'المستوى' : 'Level'}</span><strong>{profile?.level || '—'}</strong></div><div className="user-data-cell wide"><span>{ar ? 'النبذة' : 'Bio'}</span><p>{profile?.bio || '—'}</p></div></div></section>{!selectedUser.super_admin && <section className="user-detail-section"><h3>{ar ? 'إجراءات الحساب' : 'Account actions'}</h3><div className="user-detail-actions">{selectedUser.role === 'admin' ? <button className="button user-action user-action-demote" onClick={() => requestUserAction(selectedUser,'set_role','student')}><Icon name="shield" />{t('admin.demote')}</button> : <button className="button user-action user-action-promote" onClick={() => requestUserAction(selectedUser,'set_role','admin')}><Icon name="shield" />{t('admin.promote')}</button>}{banned ? <button className="button user-action user-action-enable" onClick={() => requestUserAction(selectedUser,'unban')}><Icon name="check" />{t('admin.enable')}</button> : <button className="button user-action user-action-disable" onClick={() => requestUserAction(selectedUser,'ban')}><Icon name="error" />{t('admin.disable')}</button>}</div></section>}</aside></div> })()}

    <ConfirmDialog open={Boolean(confirmState)} title={confirmState?.title ?? ''} description={confirmState?.description ?? ''} confirmLabel={confirmState?.confirmLabel ?? ''} cancelLabel={ar ? 'إلغاء' : 'Cancel'} tone={confirmState?.tone} busy={confirmBusy} onCancel={() => !confirmBusy && setConfirmState(null)} onConfirm={() => void confirmNow()} />
  </section>
}
