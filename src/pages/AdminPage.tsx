import { useEffect, useMemo, useState, type FormEvent, type ReactNode } from 'react'
import { publicStorageUrl, supabase } from '../lib/supabase'
import { StatCard } from '../components/StatCard'
import type { Category, Profile, Session, SessionSeries, SessionStatus, SessionVideo, Speaker } from '../types/domain'
import type { Database } from '../types/database'
import { errorMessage } from '../lib/errors'
import { extractYouTubeVideoId } from '../lib/youtube'
import { YouTubePlayer } from '../components/YouTubePlayer'
import { useUi } from '../hooks/useUi'
import { useAuth } from '../hooks/useAuth'
import { useToast } from '../components/ToastProvider'
import { Icon } from '../components/Icon'
import { StarRating } from '../components/StarRating'
import { ConfirmDialog } from '../components/ConfirmDialog'
import { AdminEditorDialog, type EditTarget } from '../components/AdminEditorDialog'

type SessionUpdate = Database['public']['Tables']['sessions']['Update']
type FeedbackAnalytics = {
  id: string
  user_id: string
  session_id: string
  rating: number
  comment: string | null
  created_at: string
  session: { id: string; title: string; category_id: string | null; speaker_id: string | null } | null
}
type ViewAnalytics = { user_id: string; session_id: string; session: { category_id: string | null; speaker_id: string | null } | null }
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
type Confirmation = {
  title: string
  description: string
  confirmLabel: string
  tone: 'danger' | 'warning' | 'primary'
  action: () => Promise<void>
} | null
type MutationResult = { error: unknown }

function FormField({ label, children, wide = false, hint }: { label: string; children: ReactNode; wide?: boolean; hint?: string }) {
  return <label className={`form-field ${wide ? 'wide' : ''}`}><span className="field-label">{label}</span>{children}{hint && <span className="field-hint">{hint}</span>}</label>
}

function rankedEntries(values: Map<string, number>, labels: Map<string, string>, limit = 5) {
  return [...values.entries()].map(([id, value]) => ({ id, value, label: labels.get(id) ?? id })).sort((a, b) => b.value - a.value).slice(0, limit)
}

function adminSlug(value: string, prefix: string) {
  const normalized = value
    .normalize('NFKD')
    .toLowerCase()
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .replace(/-{2,}/g, '-')
  return normalized || `${prefix}-${Date.now().toString(36)}`
}

function permissionFailure(error: unknown) {
  if (typeof error !== 'object' || error === null) return false
  const value = error as { code?: unknown; message?: unknown }
  const code = String(value.code ?? '')
  const message = String(value.message ?? '')
  return code === '42501' || /row-level security|permission denied/i.test(message)
}

export function AdminPage() {
  const { language, locale, t } = useUi()
  const ar = language === 'ar'
  const { isSuperAdmin } = useAuth()
  const { showToast } = useToast()

  const [categories, setCategories] = useState<Category[]>([])
  const [speakers, setSpeakers] = useState<Speaker[]>([])
  const [sessions, setSessions] = useState<Session[]>([])
  const [series, setSeries] = useState<SessionSeries[]>([])
  const [videos, setVideos] = useState<SessionVideo[]>([])
  const [profiles, setProfiles] = useState<Profile[]>([])
  const [feedbackRows, setFeedbackRows] = useState<FeedbackAnalytics[]>([])
  const [viewRows, setViewRows] = useState<ViewAnalytics[]>([])
  const [progressRows, setProgressRows] = useState<ProgressAnalytics[]>([])
  const [managedUsers, setManagedUsers] = useState<ManagedUser[]>([])

  const [userSearch, setUserSearch] = useState('')
  const [selectedUserId, setSelectedUserId] = useState<string | null>(null)
  const [commentSessionId, setCommentSessionId] = useState('')
  const [videoSessionId, setVideoSessionId] = useState('')
  const [videoTitle, setVideoTitle] = useState('')
  const [videoUrl, setVideoUrl] = useState('')
  const [videoPartNumber, setVideoPartNumber] = useState(1)
  const [sessionSpeakerSlots, setSessionSpeakerSlots] = useState<number[]>([0])
  const [busyUsers, setBusyUsers] = useState(false)
  const [savingContent, setSavingContent] = useState(false)
  const [editing, setEditing] = useState<EditTarget | null>(null)
  const [editorBusy, setEditorBusy] = useState(false)
  const [confirmation, setConfirmation] = useState<Confirmation>(null)
  const [confirmBusy, setConfirmBusy] = useState(false)

  function success(message: string) { showToast({ kind: 'success', title: t('common.success'), message }) }
  function fail(error: unknown) { showToast({ kind: 'error', title: t('common.error'), message: errorMessage(error) }) }

  async function load() {
    try {
      const [cat, spk, ses, ser, vid, prof, feeds, views, progress] = await Promise.all([
        supabase.from('categories').select('*').order('name'),
        supabase.from('speakers').select('*').order('name'),
        supabase.from('sessions').select('*').order('starts_at', { ascending: false }),
        supabase.from('session_series').select('*').order('created_at', { ascending: false }),
        supabase.from('session_videos').select('*').order('session_id').order('part_number').order('position'),
        supabase.from('profiles').select('*'),
        supabase.from('feedback').select('id,user_id,session_id,rating,comment,created_at,session:sessions(id,title,category_id,speaker_id)').order('created_at', { ascending: false }),
        supabase.from('session_views').select('user_id,session_id,session:sessions(category_id,speaker_id)'),
        supabase.from('video_progress').select('user_id,video_id,video:session_videos(session_id)'),
      ])
      const firstError = cat.error || spk.error || ses.error || ser.error || vid.error || prof.error || feeds.error || views.error || progress.error
      if (firstError) throw firstError

      setCategories((cat.data ?? []) as Category[])
      setSpeakers((spk.data ?? []) as Speaker[])
      setSessions((ses.data ?? []) as Session[])
      setSeries((ser.data ?? []) as SessionSeries[])
      setVideos((vid.data ?? []) as SessionVideo[])
      setProfiles((prof.data ?? []) as Profile[])
      setFeedbackRows((feeds.data ?? []) as unknown as FeedbackAnalytics[])
      setViewRows((views.data ?? []) as unknown as ViewAnalytics[])
      setProgressRows((progress.data ?? []) as unknown as ProgressAnalytics[])
    } catch (error) { fail(error) }
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
    } catch (error) { fail(error) }
    finally { setBusyUsers(false) }
  }

  useEffect(() => { void load() }, [])
  useEffect(() => { if (isSuperAdmin) void loadManagedUsers() }, [isSuperAdmin])

  async function performMutation(task: () => PromiseLike<MutationResult>) {
    let result = await task()
    if (result.error && permissionFailure(result.error)) {
      const { error: refreshError } = await supabase.auth.refreshSession()
      if (!refreshError) result = await task()
    }
    if (result.error) throw result.error
  }

  async function run(task: () => PromiseLike<MutationResult>, successMessage: string) {
    await performMutation(task)
    success(successMessage)
    await load()
  }

  async function createAndReset(form: HTMLFormElement, task: () => PromiseLike<MutationResult>, successMessage: string) {
    setSavingContent(true)
    try {
      await run(task, successMessage)
      form.reset()
      return true
    } catch (error) {
      fail(error)
      return false
    } finally { setSavingContent(false) }
  }

  function ask(action: Exclude<Confirmation, null>) { setConfirmation(action) }

  async function executeConfirmation() {
    if (!confirmation) return
    setConfirmBusy(true)
    try { await confirmation.action(); setConfirmation(null) }
    catch (error) { fail(error) }
    finally { setConfirmBusy(false) }
  }

  async function addCategory(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    const form = event.currentTarget
    const values = new FormData(form)
    const name = String(values.get('name') || '').trim()
    if (!name) return
    const slug = adminSlug(String(values.get('slug') || name), 'category')
    await createAndReset(
      form,
      () => supabase.from('categories').insert({ name, slug, description: String(values.get('description') || '').trim() || null }).select('id').single(),
      ar ? 'تمت إضافة التصنيف.' : 'Category added.',
    )
  }

  async function addSpeaker(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    const form = event.currentTarget
    const values = new FormData(form)
    const name = String(values.get('name') || '').trim()
    if (!name) return
    await createAndReset(
      form,
      () => supabase.from('speakers').insert({ name, organization: String(values.get('organization') || '').trim() || null, bio: String(values.get('bio') || '').trim() || null }).select('id').single(),
      ar ? 'تمت إضافة المتحدث.' : 'Speaker added.',
    )
  }

  async function addSeries(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    const form = event.currentTarget
    const values = new FormData(form)
    const title = String(values.get('title') || '').trim()
    if (!title) return
    if (title.length > 160) { fail(new Error(ar ? 'عنوان السلسلة يجب ألا يتجاوز 160 حرفًا.' : 'Series title must be 160 characters or fewer.')); return }
    await createAndReset(
      form,
      () => supabase.from('session_series').insert({ title, description: String(values.get('description') || '').trim() || null, published: true }).select('id').single(),
      ar ? 'تم إنشاء السلسلة.' : 'Series created.',
    )
  }

  async function addSession(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    const form = event.currentTarget
    const values = new FormData(form)
    const title = String(values.get('title') || '').trim()
    const description = String(values.get('description') || '').trim()
    const startValue = String(values.get('starts_at') || '')
    const endValue = String(values.get('ends_at') || '')
    if (title.length < 3 || !description || !startValue) { fail(new Error(ar ? 'أكملي عنوان السيشن والوصف ووقت البداية.' : 'Complete the session title, description, and start time.')); return }

    const startsAt = new Date(startValue)
    const endsAt = endValue ? new Date(endValue) : null
    if (Number.isNaN(startsAt.getTime()) || (endsAt && Number.isNaN(endsAt.getTime()))) { fail(new Error(ar ? 'التاريخ أو الوقت غير صالح.' : 'The date or time is invalid.')); return }
    if (endsAt && endsAt <= startsAt) { fail(new Error(ar ? 'وقت النهاية يجب أن يكون بعد وقت البداية.' : 'End time must be after start time.')); return }

    const capacity = Number(values.get('capacity') || 30)
    if (!Number.isFinite(capacity) || capacity < 1) { fail(new Error(ar ? 'السعة يجب أن تكون رقمًا أكبر من صفر.' : 'Capacity must be greater than zero.')); return }

    const speakerIds = [...new Set(values.getAll('speaker_ids').map(value => String(value)).filter(Boolean))]
    const seriesId = String(values.get('series_id') || '') || null
    const status = String(values.get('status') || 'published') as SessionStatus
    const slug = adminSlug(String(values.get('slug') || title), 'session')
    const payload = {
      title,
      slug,
      description,
      starts_at: startsAt.toISOString(),
      ends_at: endsAt?.toISOString() ?? null,
      location: String(values.get('location') || '').trim() || null,
      capacity,
      category_id: String(values.get('category_id') || '') || null,
      speaker_id: speakerIds[0] ?? null,
      speaker_ids: speakerIds,
      series_id: seriesId,
      series_position: seriesId ? Math.max(1, Number(values.get('series_position') || 1)) : null,
      status,
    }
    const created = await createAndReset(
      form,
      () => (supabase.from('sessions') as any).insert(payload).select('id').single(),
      ar ? 'تم إنشاء السيشن.' : 'Session created.',
    )
    if (created) setSessionSpeakerSlots([0])
  }

  async function uploadSpeakerImage(speaker: Speaker, file: File) {
    const ext = file.name.split('.').pop()?.toLowerCase() || 'jpg'
    const path = `${speaker.id}/photo.${ext}`
    try {
      const { error: uploadError } = await supabase.storage.from('speaker-images').upload(path, file, { upsert: true })
      if (uploadError) throw uploadError
      await performMutation(() => supabase.from('speakers').update({ image_path: path }).eq('id', speaker.id))
      success(ar ? 'تم تحديث صورة المتحدث.' : 'Speaker photo updated.')
      await load()
    } catch (error) { fail(error) }
  }

  async function uploadSessionCover(session: Session, file: File) {
    const ext = file.name.split('.').pop()?.toLowerCase() || 'jpg'
    const path = `${session.id}/cover.${ext}`
    try {
      const { error: uploadError } = await supabase.storage.from('session-covers').upload(path, file, { upsert: true })
      if (uploadError) throw uploadError
      await performMutation(() => supabase.from('sessions').update({ cover_path: path }).eq('id', session.id))
      success(ar ? 'تم تحديث غلاف السيشن.' : 'Session cover updated.')
      await load()
    } catch (error) { fail(error) }
  }

  async function uploadSessionResource(session: Session, file: File) {
    const safeName = file.name.replace(/[^a-zA-Z0-9._-]/g, '-')
    const path = `${session.id}/${Date.now()}-${safeName}`
    try {
      const { error: uploadError } = await supabase.storage.from('session-resources').upload(path, file)
      if (uploadError) throw uploadError
      const { error } = await supabase.from('session_resources').insert({ session_id: session.id, title: file.name, file_path: path })
      if (error) { await supabase.storage.from('session-resources').remove([path]); throw error }
      success(ar ? 'تم رفع ملف السيشن.' : 'Session resource uploaded.')
    } catch (error) { fail(error) }
  }

  async function addSessionVideo(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    const videoId = extractYouTubeVideoId(videoUrl)
    const partNumber = Math.max(1, Math.floor(Number(videoPartNumber || 1)))
    if (!videoSessionId || !videoTitle.trim() || !videoId) { fail(new Error(ar ? 'اختاري السيشن واكتبي عنوانًا والصقي رابط YouTube صالحًا.' : 'Choose a session, add a title, and paste a valid YouTube URL.')); return }
    const videosInPart = videos.filter(video => video.session_id === videoSessionId && Math.max(1, Number(video.part_number || 1)) === partNumber)
    const nextPosition = videosInPart.length ? Math.max(...videosInPart.map(video => video.position)) + 1 : 0
    setSavingContent(true)
    try {
      await run(
        () => (supabase.from('session_videos') as any).insert({ session_id: videoSessionId, title: videoTitle.trim(), youtube_video_id: videoId, part_number: partNumber, position: nextPosition }).select('id').single(),
        ar ? `تمت إضافة التسجيل إلى Part ${partNumber}.` : `Recording added to Part ${partNumber}.`,
      )
      setVideoTitle('')
      setVideoUrl('')
    } catch (error) { fail(error) }
    finally { setSavingContent(false) }
  }

  function sendNotification(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    const form = event.currentTarget
    const values = new FormData(form)
    const title = String(values.get('title') || '').trim()
    const body = String(values.get('body') || '').trim()
    const url = String(values.get('url') || '').trim() || '/'
    if (!title || !body) return
    ask({
      title: ar ? 'إرسال الإشعار؟' : 'Send notification?',
      description: ar ? 'سيتم إرسال هذا الإشعار للمستخدمين المستهدفين.' : 'This notification will be sent to the targeted users.',
      confirmLabel: ar ? 'إرسال الإشعار' : 'Send notification',
      tone: 'primary',
      action: async () => {
        const { error } = await supabase.functions.invoke('send-session-notification', { body: { title, body, url } })
        if (error) throw error
        success(ar ? 'تم إرسال الإشعار.' : 'Notification sent.')
        form.reset()
      },
    })
  }

  async function saveEdit(target: EditTarget, values: Record<string, unknown>) {
    setEditorBusy(true)
    try {
      const safeValues = { ...values }
      if (target.type === 'category') safeValues.slug = adminSlug(String(safeValues.slug || target.item.slug), 'category')
      if (target.type === 'session') {
        safeValues.slug = adminSlug(String(safeValues.slug || target.item.slug), 'session')
        const start = new Date(String(safeValues.starts_at || target.item.starts_at))
        const endValue = safeValues.ends_at
        const end = endValue ? new Date(String(endValue)) : null
        if (end && end <= start) throw new Error(ar ? 'وقت النهاية يجب أن يكون بعد وقت البداية.' : 'End time must be after start time.')
      }

      switch (target.type) {
        case 'category': await performMutation(() => supabase.from('categories').update(safeValues as Partial<Category>).eq('id', target.item.id)); break
        case 'speaker': await performMutation(() => supabase.from('speakers').update(safeValues as Partial<Speaker>).eq('id', target.item.id)); break
        case 'series': await performMutation(() => supabase.from('session_series').update(safeValues as Partial<SessionSeries>).eq('id', target.item.id)); break
        case 'session': await performMutation(() => supabase.from('sessions').update(safeValues as SessionUpdate).eq('id', target.item.id)); break
        case 'video': await performMutation(() => supabase.from('session_videos').update(safeValues as Partial<SessionVideo>).eq('id', target.item.id)); break
      }
      success(ar ? 'تم حفظ التغييرات.' : 'Changes saved.')
      setEditing(null)
      await load()
    } catch (error) { fail(error); throw error }
    finally { setEditorBusy(false) }
  }

  function confirmDelete(kind: string, name: string, action: () => Promise<void>) {
    ask({
      title: ar ? `حذف ${kind}؟` : `Delete ${kind}?`,
      description: ar ? `سيتم حذف «${name}» نهائيًا. هذا الإجراء لا يمكن التراجع عنه.` : `“${name}” will be permanently deleted. This action cannot be undone.`,
      confirmLabel: ar ? 'نعم، حذف' : 'Yes, delete',
      tone: 'danger',
      action,
    })
  }

  function manageUser(userId: string, action: 'set_role' | 'ban' | 'unban', role?: 'admin' | 'student') {
    const account = managedUsers.find(user => user.id === userId)
    const label = account?.full_name || account?.email || (ar ? 'المستخدم' : 'user')
    const title = action === 'set_role'
      ? role === 'admin' ? (ar ? 'ترقية إلى Admin؟' : 'Promote to Admin?') : (ar ? 'سحب صلاحية Admin؟' : 'Remove Admin access?')
      : action === 'ban' ? (ar ? 'تعطيل الحساب؟' : 'Disable account?') : (ar ? 'إعادة تفعيل الحساب؟' : 'Enable account?')
    const description = action === 'set_role'
      ? role === 'admin' ? (ar ? `سيحصل ${label} على صلاحيات الإدارة. تأكدي من هويته قبل المتابعة.` : `${label} will receive admin permissions. Verify their identity before continuing.`) : (ar ? `سيعود ${label} إلى صلاحيات الطالب العادية.` : `${label} will return to standard student access.`)
      : action === 'ban' ? (ar ? `لن يتمكن ${label} من تسجيل الدخول حتى إعادة تفعيل الحساب.` : `${label} will not be able to sign in until the account is enabled again.`) : (ar ? `سيتمكن ${label} من تسجيل الدخول مرة أخرى.` : `${label} will be able to sign in again.`)

    ask({
      title,
      description,
      confirmLabel: title.replace('؟', ''),
      tone: action === 'ban' ? 'danger' : action === 'set_role' ? 'warning' : 'primary',
      action: async () => {
        setBusyUsers(true)
        try {
          const { data, error } = await supabase.functions.invoke('manage-users', { body: { action, user_id: userId, role } })
          if (error) throw error
          const payload = data as { error?: string }
          if (payload.error) throw new Error(payload.error)
          success(ar ? 'تم تحديث صلاحية المستخدم.' : 'User access updated.')
          await loadManagedUsers()
        } finally { setBusyUsers(false) }
      },
    })
  }

  const analytics = useMemo(() => {
    const avgRating = feedbackRows.length ? feedbackRows.reduce((sum, row) => sum + row.rating, 0) / feedbackRows.length : 0
    const feedbackRate = viewRows.length ? Math.min(100, feedbackRows.length / viewRows.length * 100) : 0
    const categoryCounts = new Map<string, number>()
    const speakerCounts = new Map<string, number>()
    const activity = new Map<string, number>()

    for (const row of viewRows) {
      if (row.session?.category_id) categoryCounts.set(row.session.category_id, (categoryCounts.get(row.session.category_id) ?? 0) + 1)
      if (row.session?.speaker_id) speakerCounts.set(row.session.speaker_id, (speakerCounts.get(row.session.speaker_id) ?? 0) + 1)
      activity.set(row.user_id, (activity.get(row.user_id) ?? 0) + 1)
    }
    for (const row of feedbackRows) activity.set(row.user_id, (activity.get(row.user_id) ?? 0) + 2)
    for (const row of progressRows) activity.set(row.user_id, (activity.get(row.user_id) ?? 0) + 1)

    return {
      avgRating,
      feedbackRate,
      categories: rankedEntries(categoryCounts, new Map(categories.map(item => [item.id, item.name]))),
      speakers: rankedEntries(speakerCounts, new Map(speakers.map(item => [item.id, item.name]))),
      students: rankedEntries(activity, new Map(profiles.map(item => [item.id, item.full_name]))),
    }
  }, [feedbackRows, viewRows, progressRows, categories, speakers, profiles])

  const maxRanking = Math.max(1, ...analytics.categories.map(item => item.value), ...analytics.speakers.map(item => item.value))
  const profileById = useMemo(() => new Map(profiles.map(profile => [profile.id, profile])), [profiles])
  const commentedFeedback = useMemo(
    () => feedbackRows.filter(row => row.comment?.trim()).filter(row => !commentSessionId || row.session_id === commentSessionId),
    [feedbackRows, commentSessionId],
  )
  const filteredUsers = useMemo(() => {
    const query = userSearch.trim().toLowerCase()
    if (!query) return managedUsers
    return managedUsers.filter(account => [account.full_name, account.email, account.phone, account.profile?.university, account.profile?.department, account.profile?.level].some(value => String(value ?? '').toLowerCase().includes(query)))
  }, [managedUsers, userSearch])
  const selectedUser = managedUsers.find(account => account.id === selectedUserId) ?? null
  const selectedUserAvatar = selectedUser?.profile?.avatar_path ? publicStorageUrl('profile-images', selectedUser.profile.avatar_path) : null

  return <section className="admin-page-v2">
    <div className="section-heading"><div><div className="eyebrow">{t('admin.eyebrow')}</div><h1>{t('admin.title')}</h1><p>{t('admin.subtitle')}</p></div></div>
    <div className="stats-grid stats-grid-v2">
      <StatCard label={t('admin.users')} value={profiles.length} />
      <StatCard label={t('admin.sessions')} value={sessions.length} />
      <StatCard label={ar ? 'التقييمات' : 'Feedback'} value={feedbackRows.length} />
      <StatCard label={t('admin.speakers')} value={speakers.length} />
    </div>

    <section className="panel section-gap admin-section">
      <div className="admin-v3-section-head"><div><span className="eyebrow">{t('admin.analytics')}</span><h2>{t('admin.analytics')}</h2></div><Icon name="chart" /></div>
      <div className="analytics-kpis">
        <div><span>{t('admin.views')}</span><strong>{viewRows.length}</strong></div>
        <div><span>{ar ? 'عدد التقييمات' : 'Feedback entries'}</span><strong>{feedbackRows.length}</strong></div>
        <div className="rating-kpi"><span>{t('admin.avgRating')}</span><strong><StarRating value={Math.round(analytics.avgRating)} label={t('admin.avgRating')} readOnly /></strong></div>
        <div><span>{t('admin.videoStarts')}</span><strong>{progressRows.length}</strong></div>
        <div><span>{ar ? 'نسبة التفاعل' : 'Feedback rate'}</span><strong>{Math.round(analytics.feedbackRate)}%</strong></div>
      </div>
      <div className="analytics-grid">
        <div><h3>{t('admin.topCategories')}</h3>{analytics.categories.map(item => <div className="ranking-row" key={item.id}><span>{item.label}</span><i><b style={{ width: `${item.value / maxRanking * 100}%` }} /></i><strong>{item.value}</strong></div>)}</div>
        <div><h3>{t('admin.topSpeakers')}</h3>{analytics.speakers.map(item => <div className="ranking-row" key={item.id}><span>{item.label}</span><i><b style={{ width: `${item.value / maxRanking * 100}%` }} /></i><strong>{item.value}</strong></div>)}</div>
        <div><h3>{t('admin.activeStudents')}</h3>{analytics.students.map((item, index) => <div className="student-rank" key={item.id}><em>{index + 1}</em><span>{item.label}</span><strong>{item.value}</strong></div>)}</div>
      </div>
    </section>

    <section className="panel section-gap admin-section admin-comments-panel">
      <div className="admin-v3-section-head"><div><span className="eyebrow">{ar ? 'آراء المستخدمين' : 'User feedback'}</span><h2>{ar ? 'تعليقات السيشنات' : 'Session comments'}</h2><p>{ar ? 'كل التعليقات والتقييمات التي كتبها المستخدمون على السيشنات.' : 'Comments and ratings left by users on published sessions.'}</p></div><span className="admin-comment-total">{commentedFeedback.length}</span></div>
      <div className="admin-comments-toolbar">
        <FormField label={ar ? 'فلترة حسب السيشن' : 'Filter by session'}><select value={commentSessionId} onChange={event => setCommentSessionId(event.target.value)}><option value="">{ar ? 'كل السيشنات' : 'All sessions'}</option>{sessions.map(session => <option key={session.id} value={session.id}>{session.title}</option>)}</select></FormField>
      </div>
      <div className="admin-comment-list">
        {commentedFeedback.map(row => {
          const profile = profileById.get(row.user_id)
          const avatar = profile?.avatar_path ? publicStorageUrl('profile-images', profile.avatar_path) : null
          return <article className="admin-comment-card" key={row.id}>
            <div className="admin-comment-head">
              <div className="admin-comment-author"><span className="directory-avatar">{avatar ? <img src={avatar} alt="" /> : (profile?.full_name || 'U').slice(0, 1).toUpperCase()}</span><span><strong>{profile?.full_name || (ar ? 'مستخدم' : 'User')}</strong><small>{row.session?.title || (ar ? 'سيشن غير متاح' : 'Unavailable session')}</small></span></div>
              <div className="admin-comment-rating"><StarRating value={row.rating} label={ar ? 'التقييم' : 'Rating'} readOnly /></div>
            </div>
            <p>{row.comment}</p>
            <time dateTime={row.created_at}>{new Intl.DateTimeFormat(locale, { dateStyle: 'medium', timeStyle: 'short' }).format(new Date(row.created_at))}</time>
          </article>
        })}
        {!commentedFeedback.length && <div className="empty-state">{ar ? 'لا توجد تعليقات في هذا الاختيار حتى الآن.' : 'No comments for this selection yet.'}</div>}
      </div>
    </section>

    {isSuperAdmin && <section className="panel section-gap admin-section">
      <div className="admin-v3-section-head"><div><span className="eyebrow">{t('admin.superAdmin')}</span><h2>{t('admin.userManagement')}</h2><p>{t('admin.superOnly')}</p></div><Icon name="users" /></div>
      <div className="user-directory-toolbar"><FormField label={ar ? 'ابحثي في المستخدمين' : 'Search users'}><input value={userSearch} onChange={event => setUserSearch(event.target.value)} placeholder={ar ? 'الاسم، البريد، الجامعة أو القسم' : 'Name, email, university or department'} /></FormField><span className="user-result-count">{filteredUsers.length} {ar ? 'حساب' : 'accounts'}</span></div>
      <div className="user-management-list">
        {filteredUsers.map(account => {
          const banned = Boolean(account.banned_until && new Date(account.banned_until).getTime() > Date.now())
          const avatar = account.profile?.avatar_path ? publicStorageUrl('profile-images', account.profile.avatar_path) : null
          return <article className="user-management-row" key={account.id}>
            <div className="user-identity"><span className="directory-avatar directory-avatar-user">{avatar ? <img src={avatar} alt="" /> : (account.full_name || account.email || 'U').slice(0, 1).toUpperCase()}</span><span><strong>{account.full_name || account.email}</strong><small>{account.email}</small></span></div>
            <div className="user-role"><span className={`role-pill ${account.super_admin ? 'super' : account.role}`}>{account.super_admin ? t('admin.superAdmin') : account.role === 'admin' ? t('admin.roleAdmin') : t('admin.roleStudent')}</span>{banned && <span className="role-pill banned">{ar ? 'معطّل' : 'Disabled'}</span>}</div>
            <div className="user-activity"><small>{t('admin.activity')}</small><span>{account.activity.feedback} {ar ? 'تقييم' : 'feedback'} · {account.activity.video_progress} {ar ? 'فيديو' : 'videos'}</span></div>
            <div className="user-management-actions"><button className="button user-action user-action-view" onClick={() => setSelectedUserId(account.id)}>{ar ? 'عرض التفاصيل' : 'View details'}</button>{!account.super_admin && <>{account.role === 'admin' ? <button className="button user-action user-action-demote" disabled={busyUsers} onClick={() => manageUser(account.id, 'set_role', 'student')}><Icon name="shield" />{t('admin.demote')}</button> : <button className="button user-action user-action-promote" disabled={busyUsers} onClick={() => manageUser(account.id, 'set_role', 'admin')}><Icon name="shield" />{t('admin.promote')}</button>}{banned ? <button className="button user-action user-action-enable" disabled={busyUsers} onClick={() => manageUser(account.id, 'unban')}>{t('admin.enable')}</button> : <button className="button user-action user-action-disable" disabled={busyUsers} onClick={() => manageUser(account.id, 'ban')}>{t('admin.disable')}</button>}</>}</div>
          </article>
        })}
        {busyUsers && !managedUsers.length && <div className="page-state">{t('common.loading')}</div>}
      </div>
    </section>}

    <section className="panel section-gap admin-section">
      <div className="admin-v3-section-head"><div><h2>{t('admin.series')}</h2><p>{ar ? 'أنشئي مسارات مترابطة ورتبي السيشنات داخلها.' : 'Create structured learning series.'}</p></div><Icon name="layers" /></div>
      <form className="admin-form-grid" onSubmit={event => void addSeries(event)} aria-busy={savingContent}><FormField label={t('admin.seriesTitle')}><input name="title" maxLength={160} required /></FormField><FormField label={t('admin.seriesDescription')}><input name="description" /></FormField><button className="button button-primary" disabled={savingContent}>{t('admin.createSeries')}</button></form>
      <div className="admin-v3-list">{series.map(item => <div className="admin-v3-item" key={item.id}><span className="admin-v3-item-copy"><strong>{item.title}</strong><small>{item.description || '—'}</small></span><div className="admin-v3-actions"><button className="button button-ghost" onClick={() => setEditing({ type: 'series', item })}>{t('common.edit')}</button><button className="button danger" onClick={() => confirmDelete(ar ? 'السلسلة' : 'series', item.title, async () => { await run(() => supabase.from('session_series').delete().eq('id', item.id), ar ? 'تم حذف السلسلة.' : 'Series deleted.') })}>{t('common.delete')}</button></div></div>)}</div>
    </section>

    <div className="admin-grid section-gap">
      <section className="panel"><h2>{t('admin.category')}</h2><form className="admin-form-grid" onSubmit={event => void addCategory(event)} aria-busy={savingContent}><FormField label={t('admin.name')}><input name="name" required /></FormField><FormField label={ar ? 'Slug (اختياري)' : 'Slug (optional)'} hint={ar ? 'إذا تركتيه فارغًا سيتم توليده تلقائيًا.' : 'Leave blank to generate it automatically.'}><input name="slug" inputMode="url" /></FormField><FormField label={t('admin.description')} wide><textarea name="description" rows={3} /></FormField><button className="button button-primary" disabled={savingContent}>{t('common.add')}</button></form><div className="admin-v3-list">{categories.map(item => <div className="admin-v3-item" key={item.id}><span className="admin-v3-item-copy"><strong>{item.name}</strong><small>{item.slug}</small></span><div className="admin-v3-actions"><button className="button button-ghost" onClick={() => setEditing({ type: 'category', item })}>{t('common.edit')}</button><button className="button danger" onClick={() => confirmDelete(ar ? 'التصنيف' : 'category', item.name, async () => { await run(() => supabase.from('categories').delete().eq('id', item.id), ar ? 'تم حذف التصنيف.' : 'Category deleted.') })}>{t('common.delete')}</button></div></div>)}</div></section>
      <section className="panel"><h2>{t('admin.speakers')}</h2><form className="admin-form-grid" onSubmit={event => void addSpeaker(event)} aria-busy={savingContent}><FormField label={t('admin.name')}><input name="name" required /></FormField><FormField label={ar ? 'الجامعة / الشركة / المؤسسة' : t('admin.organization')}><input name="organization" /></FormField><FormField label={ar ? 'النبذة' : 'Bio'} wide><textarea name="bio" rows={3} /></FormField><button className="button button-primary" disabled={savingContent}>{t('common.add')}</button></form><div className="admin-v3-list">{speakers.map(item => <div className="admin-v3-item" key={item.id}><span className="admin-v3-item-copy"><strong>{item.name}</strong><small>{item.organization || '—'}</small></span><div className="admin-v3-actions"><label className="file-action">{ar ? 'صورة' : 'Photo'}<input type="file" accept="image/*" onChange={event => event.target.files?.[0] && void uploadSpeakerImage(item, event.target.files[0])} /></label><button className="button button-ghost" onClick={() => setEditing({ type: 'speaker', item })}>{t('common.edit')}</button><button className="button danger" onClick={() => confirmDelete(ar ? 'المتحدث' : 'speaker', item.name, async () => { await run(() => supabase.from('speakers').delete().eq('id', item.id), ar ? 'تم حذف المتحدث.' : 'Speaker deleted.') })}>{t('common.delete')}</button></div></div>)}</div></section>
    </div>

    <section className="panel section-gap admin-section">
      <div className="admin-v3-section-head"><div><h2>{t('admin.sessions')}</h2><p>{ar ? 'كل بيانات السيشن قابلة للتعديل، والـSlug يتم ضبطه تلقائيًا.' : 'Every session field is editable and slugs are normalized automatically.'}</p></div></div>
      <form className="admin-form-grid" onSubmit={event => void addSession(event)} aria-busy={savingContent}>
        <FormField label={t('admin.titleField')}><input name="title" minLength={3} maxLength={180} required /></FormField>
        <FormField label={ar ? 'Slug (اختياري)' : 'Slug (optional)'} hint={ar ? 'اتركيه فارغًا لتوليده تلقائيًا.' : 'Leave blank to generate automatically.'}><input name="slug" inputMode="url" /></FormField>
        <FormField label={t('admin.description')} wide><textarea name="description" rows={4} required /></FormField>
        <FormField label={ar ? 'وقت البداية' : 'Start time'}><input name="starts_at" type="datetime-local" required /></FormField>
        <FormField label={ar ? 'وقت النهاية' : 'End time'}><input name="ends_at" type="datetime-local" /></FormField>
        <FormField label={ar ? 'المكان / رابط الحضور' : 'Location / meeting link'}><input name="location" /></FormField>
        <FormField label={t('details.capacity')}><input name="capacity" type="number" min="1" defaultValue="30" required /></FormField>
        <FormField label={ar ? 'التصنيف' : 'Category'}><select name="category_id"><option value="">{t('admin.noCategory')}</option>{categories.map(item => <option key={item.id} value={item.id}>{item.name}</option>)}</select></FormField>
        <div className="form-field wide">
          <span className="field-label">{ar ? 'المتحدثون' : 'Speakers'}</span>
          <div style={{ display: 'grid', gap: '.65rem' }}>
            {sessionSpeakerSlots.map((slot, index) => <div key={slot} style={{ display: 'grid', gridTemplateColumns: index === 0 ? 'minmax(0, 1fr)' : 'minmax(0, 1fr) auto', gap: '.55rem', alignItems: 'center' }}>
              <select name="speaker_ids" aria-label={ar ? `المتحدث ${index + 1}` : `Speaker ${index + 1}`}>
                <option value="">{index === 0 ? t('admin.noSpeaker') : (ar ? 'اختاري متحدثًا إضافيًا' : 'Choose another speaker')}</option>
                {speakers.map(item => <option key={item.id} value={item.id}>{item.name}{item.organization ? ` — ${item.organization}` : ''}</option>)}
              </select>
              {index > 0 && <button type="button" className="button button-ghost" onClick={() => setSessionSpeakerSlots(current => current.filter(item => item !== slot))}>{ar ? 'إزالة' : 'Remove'}</button>}
            </div>)}
            <button
              type="button"
              className="button button-ghost"
              disabled={!speakers.length || sessionSpeakerSlots.length >= speakers.length}
              onClick={() => setSessionSpeakerSlots(current => [...current, (current.at(-1) ?? -1) + 1])}
              style={{ justifySelf: 'start' }}
            >
              <span aria-hidden="true">＋</span>{ar ? 'إضافة متحدث آخر' : 'Add another speaker'}
            </button>
          </div>
          <span className="field-hint">{ar ? 'اختاري المتحدث الأول، واضغطي + فقط إذا كان للسيشن متحدث إضافي.' : 'Choose the first speaker, then use + only when the session has another speaker.'}</span>
        </div>
        <FormField label={t('admin.series')}><select name="series_id"><option value="">{t('admin.noSeries')}</option>{series.map(item => <option key={item.id} value={item.id}>{item.title}</option>)}</select></FormField>
        <FormField label={t('admin.seriesPosition')}><input name="series_position" type="number" min="1" defaultValue="1" /></FormField>
        <FormField label={ar ? 'الحالة' : 'Status'}><select name="status" defaultValue="published"><option value="draft">{ar ? 'مسودة' : 'Draft'}</option><option value="published">{ar ? 'منشور' : 'Published'}</option><option value="cancelled">{ar ? 'ملغي' : 'Cancelled'}</option></select></FormField>
        <button className="button button-primary" disabled={savingContent}>{savingContent ? (ar ? 'جارٍ الحفظ…' : 'Saving…') : t('admin.createSession')}</button>
      </form>
      <div className="admin-v3-list">{sessions.map(item => <div className="admin-v3-item" key={item.id}><span className="admin-v3-item-copy"><strong>{item.title}</strong><small>{new Intl.DateTimeFormat(locale, { dateStyle: 'medium', timeStyle: 'short' }).format(new Date(item.starts_at))} · {item.status}</small></span><div className="admin-v3-actions"><label className="file-action">{t('admin.cover')}<input type="file" accept="image/*" onChange={event => event.target.files?.[0] && void uploadSessionCover(item, event.target.files[0])} /></label><label className="file-action">{t('admin.resource')}<input type="file" onChange={event => event.target.files?.[0] && void uploadSessionResource(item, event.target.files[0])} /></label><button className="button button-ghost" onClick={() => setEditing({ type: 'session', item })}>{t('common.edit')}</button><button className="button danger" onClick={() => confirmDelete(ar ? 'السيشن' : 'session', item.title, async () => { await run(() => supabase.from('sessions').delete().eq('id', item.id), ar ? 'تم حذف السيشن.' : 'Session deleted.') })}>{t('common.delete')}</button></div></div>)}</div>
    </section>

    <section className="panel section-gap video-admin-panel">
      <div className="video-admin-heading"><div><div className="eyebrow">YouTube</div><h2>{t('admin.youtube')}</h2><p>{ar ? 'أضيفي أكثر من رابط لنفس السيشن وحددي لكل فيديو الـPart الخاص به. يمكن أن يحتوي الـPart الواحد على أكثر من فيديو.' : 'Add multiple links to one session and assign each video to a part. A part can contain multiple videos.'}</p></div></div>
      <div className="video-admin-layout"><form className="video-admin-form" onSubmit={event => void addSessionVideo(event)}><FormField label={t('admin.videoSession')}><select value={videoSessionId} onChange={event => setVideoSessionId(event.target.value)} required><option value="">{t('admin.videoSession')}</option>{sessions.map(session => <option key={session.id} value={session.id}>{session.title}</option>)}</select></FormField><FormField label={t('admin.videoTitle')}><input value={videoTitle} onChange={event => setVideoTitle(event.target.value)} required /></FormField><FormField label="Part" hint={ar ? 'مثلاً 1 أو 2 أو 3. كل الفيديوهات بنفس الرقم ستظهر داخل نفس الجزء.' : 'For example 1, 2, or 3. Videos with the same number appear in the same part.'}><input type="number" min="1" step="1" value={videoPartNumber} onChange={event => setVideoPartNumber(Math.max(1, Math.floor(Number(event.target.value) || 1)))} required /></FormField><FormField label={t('admin.youtubeUrl')}><input value={videoUrl} onChange={event => setVideoUrl(event.target.value)} inputMode="url" placeholder="https://youtu.be/..." required /></FormField><button className="button button-primary wide" disabled={savingContent}>{savingContent ? (ar ? 'جارٍ إضافة الفيديو…' : 'Adding video…') : t('admin.addRecording')}</button></form><div className="video-preview">{extractYouTubeVideoId(videoUrl) ? <><span className="video-part-preview-badge">Part {videoPartNumber}</span><YouTubePlayer videoId={extractYouTubeVideoId(videoUrl)!} title={videoTitle || t('admin.preview')} /></> : <div className="video-preview-empty"><strong>{t('admin.preview')}</strong><span>{ar ? 'الصقي رابط YouTube صالحًا لرؤية المعاينة.' : 'Paste a valid YouTube URL to preview it.'}</span></div>}</div></div>
      <div className="admin-v3-list">{videos.map(item => <div className="admin-v3-item" key={item.id}><span className="admin-v3-item-copy"><strong>{item.title}</strong><small>Part {item.part_number ?? 1} · {sessions.find(session => session.id === item.session_id)?.title || '—'}</small></span><div className="admin-v3-actions"><button className="button button-ghost" onClick={() => setEditing({ type: 'video', item })}>{t('common.edit')}</button><button className="button danger" onClick={() => confirmDelete(ar ? 'التسجيل' : 'recording', item.title, async () => { await run(() => supabase.from('session_videos').delete().eq('id', item.id), ar ? 'تم حذف التسجيل.' : 'Recording deleted.') })}>{t('common.delete')}</button></div></div>)}</div>
    </section>

    <section className="panel section-gap notification-admin-panel"><h2>{t('admin.push')}</h2><form className="notification-form" onSubmit={sendNotification}><FormField label={t('admin.pushTitle')}><input name="title" required /></FormField><FormField label={t('admin.pushBody')}><textarea name="body" required /></FormField><FormField label={ar ? 'الرابط داخل المنصة' : 'App link'}><input name="url" defaultValue="/" /></FormField><button className="button button-primary">{t('admin.sendPush')}</button></form></section>

    {selectedUser && <div className="user-detail-backdrop" role="presentation" onMouseDown={event => { if (event.currentTarget === event.target) setSelectedUserId(null) }}><aside className="user-detail-drawer" role="dialog" aria-modal="true"><header className="user-detail-head"><div className="user-detail-identity">{selectedUserAvatar ? <img className="user-detail-avatar" src={selectedUserAvatar} alt="" /> : <span className="user-detail-avatar">{(selectedUser.full_name || selectedUser.email).slice(0, 1).toUpperCase()}</span>}<div><h2>{selectedUser.full_name || selectedUser.email}</h2><p>{selectedUser.email}</p></div></div><button className="user-detail-close" onClick={() => setSelectedUserId(null)}><Icon name="close" /></button></header>
      <section className="user-detail-section"><h3>{ar ? 'بيانات الحساب' : 'Account details'}</h3><div className="user-detail-grid"><div className="user-data-cell"><span>Email</span><strong>{selectedUser.email}</strong></div><div className="user-data-cell"><span>{ar ? 'تأكيد البريد' : 'Email verified'}</span><strong>{selectedUser.email_confirmed_at ? (ar ? 'مؤكد' : 'Verified') : (ar ? 'غير مؤكد' : 'Not verified')}</strong></div><div className="user-data-cell"><span>{ar ? 'الهاتف' : 'Phone'}</span><strong>{selectedUser.phone || '—'}</strong></div><div className="user-data-cell"><span>{ar ? 'الدور' : 'Role'}</span><strong>{selectedUser.super_admin ? 'Super Admin' : selectedUser.role}</strong></div><div className="user-data-cell wide"><span>User ID</span><strong>{selectedUser.id}</strong></div><div className="user-data-cell"><span>{ar ? 'إنشاء الحساب' : 'Created'}</span><strong>{new Intl.DateTimeFormat(locale, { dateStyle: 'medium' }).format(new Date(selectedUser.created_at))}</strong></div><div className="user-data-cell"><span>{t('admin.lastSignIn')}</span><strong>{selectedUser.last_sign_in_at ? new Intl.DateTimeFormat(locale, { dateStyle: 'medium', timeStyle: 'short' }).format(new Date(selectedUser.last_sign_in_at)) : '—'}</strong></div></div></section>
      <section className="user-detail-section"><h3>{ar ? 'البروفايل' : 'Profile'}</h3><div className="user-detail-grid"><div className="user-data-cell"><span>{ar ? 'الاسم' : 'Name'}</span><strong>{selectedUser.profile?.full_name || selectedUser.full_name || '—'}</strong></div><div className="user-data-cell"><span>{ar ? 'الجامعة' : 'University'}</span><strong>{selectedUser.profile?.university || '—'}</strong></div><div className="user-data-cell"><span>{ar ? 'القسم' : 'Department'}</span><strong>{selectedUser.profile?.department || '—'}</strong></div><div className="user-data-cell"><span>{ar ? 'المستوى' : 'Level'}</span><strong>{selectedUser.profile?.level || '—'}</strong></div><div className="user-data-cell wide"><span>{ar ? 'النبذة' : 'Bio'}</span><p>{selectedUser.profile?.bio || '—'}</p></div></div></section>
      <section className="user-detail-section"><h3>{t('admin.activity')}</h3><div className="user-detail-grid"><div className="user-data-cell"><span>{ar ? 'التقييمات' : 'Feedback'}</span><strong>{selectedUser.activity.feedback}</strong></div><div className="user-data-cell"><span>{ar ? 'الفيديوهات' : 'Video progress'}</span><strong>{selectedUser.activity.video_progress}</strong></div></div></section></aside></div>}

    <AdminEditorDialog target={editing} categories={categories} speakers={speakers} series={series} sessions={sessions} language={language} busy={editorBusy} onClose={() => !editorBusy && setEditing(null)} onSave={saveEdit} />
    <ConfirmDialog open={Boolean(confirmation)} title={confirmation?.title || ''} description={confirmation?.description || ''} confirmLabel={confirmation?.confirmLabel || ''} cancelLabel={ar ? 'إلغاء' : 'Cancel'} tone={confirmation?.tone || 'primary'} busy={confirmBusy} onCancel={() => !confirmBusy && setConfirmation(null)} onConfirm={() => void executeConfirmation()} />
  </section>
}
