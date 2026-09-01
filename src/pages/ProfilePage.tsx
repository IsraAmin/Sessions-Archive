import { useEffect, useState, type ChangeEvent, type FormEvent } from 'react'
import { useAuth } from '../hooks/useAuth'
import { useUi } from '../hooks/useUi'
import { supabase, publicStorageUrl } from '../lib/supabase'
import type { Profile } from '../types/domain'
import { errorMessage } from '../lib/errors'
import { compressProfileImage } from '../lib/image'
import { useToast } from '../components/ToastProvider'
import {
  disablePushNotifications,
  enablePushNotifications,
  getPushEnvironmentIssue,
  getPushNotificationStatus,
  type PushStatus,
} from '../lib/push'

type NotificationPreferences = {
  user_id: string
  push_enabled: boolean
  session_reminders: boolean
  session_updates: boolean
  new_content: boolean
  announcements: boolean
  reminder_minutes: number
  language: 'ar' | 'en'
}

const REMINDER_OPTIONS = [5, 10, 15, 30, 60, 120, 1440] as const

function defaultPreferences(userId: string, language: string): NotificationPreferences {
  return {
    user_id: userId,
    push_enabled: true,
    session_reminders: true,
    session_updates: true,
    new_content: true,
    announcements: true,
    reminder_minutes: 30,
    language: language === 'en' ? 'en' : 'ar',
  }
}

export function ProfilePage() {
  const { user } = useAuth()
  const { t, language } = useUi()
  const { showToast } = useToast()
  const [profile, setProfile] = useState<Profile | null>(null)
  const [preferences, setPreferences] = useState<NotificationPreferences | null>(null)
  const [pushStatus, setPushStatus] = useState<PushStatus>('checking')
  const [message, setMessage] = useState('')
  const [busy, setBusy] = useState(false)
  const [pushBusy, setPushBusy] = useState(false)
  const [preferencesBusy, setPreferencesBusy] = useState(false)
  const ar = language === 'ar'

  useEffect(() => {
    if (!user) return
    void supabase.from('profiles').select('*').eq('id', user.id).single().then(({ data, error }) => {
      if (error) setMessage(error.message)
      else setProfile(data as Profile)
    })
  }, [user?.id])

  useEffect(() => {
    if (!user) return
    void (async () => {
      const fallback = defaultPreferences(user.id, language)
      const { data, error } = await supabase
        .from('notification_preferences')
        .select('*')
        .eq('user_id', user.id)
        .maybeSingle()

      if (error) {
        console.warn('Notification preferences loading failed', error)
        setPreferences(fallback)
      } else if (data) {
        setPreferences(data as NotificationPreferences)
      } else {
        const { data: created, error: createError } = await supabase
          .from('notification_preferences')
          .upsert(fallback, { onConflict: 'user_id' })
          .select('*')
          .single()
        if (createError) console.warn('Notification preferences initialization failed', createError)
        setPreferences((created as NotificationPreferences | null) ?? fallback)
      }

      setPushStatus(await getPushNotificationStatus())
    })()
  }, [user?.id])

  function failed(error: unknown) {
    showToast({ kind: 'error', title: t('common.error'), message: errorMessage(error) })
  }

  async function save(event: FormEvent) {
    event.preventDefault()
    if (!user || !profile) return
    setBusy(true)
    try {
      const { error } = await supabase.from('profiles').update({
        full_name: profile.full_name,
        university: profile.university,
        department: profile.department,
        level: profile.level,
        bio: profile.bio,
      }).eq('id', user.id)
      if (error) throw error
      showToast({ kind: 'success', title: t('common.success'), message: t('profile.saved') })
    } catch (error) {
      failed(error)
    } finally {
      setBusy(false)
    }
  }

  async function uploadAvatar(event: ChangeEvent<HTMLInputElement>) {
    const file = event.target.files?.[0]
    event.target.value = ''
    if (!file || !user || !profile) return
    setBusy(true)
    try {
      const compressed = await compressProfileImage(file)
      const extension = compressed.file.type === 'image/webp' ? 'webp' : 'jpg'
      const path = `${user.id}/avatar.${extension}`
      const { error: uploadError } = await supabase.storage.from('profile-images').upload(path, compressed.file, {
        upsert: true,
        contentType: compressed.file.type,
        cacheControl: '3600',
      })
      if (uploadError) throw uploadError
      const { error: updateError } = await supabase.from('profiles').update({ avatar_path: path }).eq('id', user.id)
      if (updateError) throw updateError
      setProfile({ ...profile, avatar_path: path })
      showToast({ kind: 'success', title: t('common.success'), message: ar ? 'تم تحديث الصورة الشخصية.' : 'Profile photo updated.' })
    } catch (error) {
      failed(error)
    } finally {
      setBusy(false)
    }
  }

  async function savePreferences(patch: Partial<NotificationPreferences>, successMessage?: string) {
    if (!user || !preferences) return
    const next: NotificationPreferences = {
      ...preferences,
      ...patch,
      user_id: user.id,
      language: language === 'en' ? 'en' : 'ar',
    }
    setPreferences(next)
    setPreferencesBusy(true)
    try {
      const { data, error } = await supabase
        .from('notification_preferences')
        .upsert(next, { onConflict: 'user_id' })
        .select('*')
        .single()
      if (error) throw error
      setPreferences(data as NotificationPreferences)
      if (successMessage) showToast({ kind: 'success', title: t('common.success'), message: successMessage })
    } catch (error) {
      setPreferences(preferences)
      failed(error)
    } finally {
      setPreferencesBusy(false)
    }
  }

  async function togglePush() {
    if (!user || !preferences) return
    setPushBusy(true)
    try {
      if (pushStatus === 'enabled') {
        await disablePushNotifications(user.id)
        await savePreferences({ push_enabled: false })
        setPushStatus('default')
        showToast({ kind: 'success', title: t('common.success'), message: ar ? 'تم إيقاف إشعارات الجهاز لهذا المتصفح.' : 'Device notifications are off for this browser.' })
      } else {
        await enablePushNotifications(user.id)
        await savePreferences({ push_enabled: true })
        setPushStatus('enabled')
        showToast({ kind: 'success', title: t('common.success'), message: ar ? 'تم تفعيل إشعارات الجهاز بنجاح.' : 'Device notifications are enabled.' })
      }
    } catch (error) {
      setPushStatus(await getPushNotificationStatus())
      failed(error)
    } finally {
      setPushBusy(false)
    }
  }

  if (!profile) return <div className="page-state">{message || t('common.loading')}</div>
  const avatar = publicStorageUrl('profile-images', profile.avatar_path)
  const environmentIssue = typeof window === 'undefined' ? '' : getPushEnvironmentIssue()
  const pushEnabled = pushStatus === 'enabled'
  const pushStatusLabel = pushEnabled
    ? (ar ? 'مفعّلة على هذا الجهاز' : 'Enabled on this device')
    : pushStatus === 'denied'
      ? (ar ? 'محظورة من المتصفح' : 'Blocked by browser')
      : pushStatus === 'unsupported'
        ? (ar ? 'غير مدعومة هنا' : 'Not supported here')
        : pushStatus === 'checking'
          ? (ar ? 'جاري التحقق…' : 'Checking…')
          : (ar ? 'غير مفعّلة على هذا الجهاز' : 'Not enabled on this device')

  return <section className="panel profile-panel">
    <div className="profile-hero"><div><div className="eyebrow">{t('profile.eyebrow')}</div><h1>{t('profile.title')}</h1><p>{t('profile.subtitle')}</p></div><div className="profile-avatar-wrap">{avatar ? <img className="avatar avatar-large" src={avatar} alt={profile.full_name} /> : <div className="avatar avatar-large avatar-placeholder" aria-hidden="true">{profile.full_name.slice(0, 1)}</div>}</div></div>
    <form className="form-grid" onSubmit={save}>
      <label>{t('profile.fullName')}<input value={profile.full_name} onChange={(e) => setProfile({ ...profile, full_name: e.target.value })} required /></label>
      <label>{t('profile.university')}<input value={profile.university ?? ''} onChange={(e) => setProfile({ ...profile, university: e.target.value || null })} /></label>
      <label>{t('profile.department')}<input value={profile.department ?? ''} onChange={(e) => setProfile({ ...profile, department: e.target.value || null })} /></label>
      <label>{t('profile.level')}<input value={profile.level ?? ''} onChange={(e) => setProfile({ ...profile, level: e.target.value || null })} /></label>
      <label className="wide">{t('profile.bio')}<textarea rows={4} value={profile.bio ?? ''} onChange={(e) => setProfile({ ...profile, bio: e.target.value || null })} /></label>
      <div className="wide profile-upload-card"><div><strong>{t('profile.photo')}</strong><p>{ar ? 'اختر صورة شخصية واضحة وسيتم تجهيزها تلقائيًا قبل الحفظ.' : 'Choose a clear profile photo. It will be prepared automatically before saving.'}</p></div><label className="button button-secondary profile-upload-button">{busy ? t('profile.preparing') : t('profile.choosePhoto')}<input type="file" accept="image/*" disabled={busy} onChange={(event) => void uploadAvatar(event)} /></label></div>
      <button className="button button-primary" disabled={busy}>{t('common.save')}</button>
    </form>

    <section className="notification-settings" aria-labelledby="notification-settings-title">
      <div className="notification-card">
        <div>
          <div className="eyebrow">Push Notifications</div>
          <h2 id="notification-settings-title">{ar ? 'إشعارات الجهاز' : 'Device notifications'}</h2>
          <p>{ar ? 'استلم التذكيرات والتحديثات حتى عندما تكون المنصة مغلقة.' : 'Receive reminders and updates even when the app is closed.'}</p>
          <span className={`push-status-pill ${pushEnabled ? 'is-enabled' : ''}`}>{pushStatusLabel}</span>
        </div>
        <button
          type="button"
          className={`button ${pushEnabled ? 'button-secondary' : 'button-primary'}`}
          disabled={pushBusy || pushStatus === 'checking' || (!pushEnabled && Boolean(environmentIssue))}
          onClick={() => void togglePush()}
        >
          {pushBusy
            ? (ar ? 'جاري التحديث…' : 'Updating…')
            : pushEnabled
              ? (ar ? 'إيقاف إشعارات الجهاز' : 'Disable device notifications')
              : (ar ? 'تفعيل إشعارات الجهاز' : 'Enable device notifications')}
        </button>
      </div>

      {!pushEnabled && environmentIssue && <p className="notification-environment-note" role="status">{environmentIssue}</p>}

      {preferences && <div className="notification-settings-list" aria-busy={preferencesBusy}>
        <label className="notification-setting-row">
          <span className="notification-setting-copy"><strong>{ar ? 'تذكيرات السيشنات' : 'Session reminders'}</strong><small>{ar ? 'تنبيه قبل موعد السيشن المسجل فيها.' : 'Get alerted before a session you are registered for.'}</small></span>
          <input type="checkbox" checked={preferences.session_reminders} disabled={preferencesBusy} onChange={(event) => void savePreferences({ session_reminders: event.target.checked })} />
        </label>

        {preferences.session_reminders && <label className="notification-setting-row notification-reminder-row">
          <span className="notification-setting-copy"><strong>{ar ? 'وقت التذكير' : 'Reminder time'}</strong><small>{ar ? 'اختر المدة قبل بداية السيشن.' : 'Choose how early the reminder should arrive.'}</small></span>
          <select className="notification-reminder-select" value={preferences.reminder_minutes} disabled={preferencesBusy} onChange={(event) => void savePreferences({ reminder_minutes: Number(event.target.value) })}>
            {REMINDER_OPTIONS.map((minutes) => <option key={minutes} value={minutes}>{minutes === 1440 ? (ar ? 'قبل يوم' : '1 day before') : minutes >= 60 ? (ar ? `قبل ${minutes / 60} ساعة` : `${minutes / 60}h before`) : (ar ? `قبل ${minutes} دقيقة` : `${minutes}m before`)}</option>)}
          </select>
        </label>}

        <label className="notification-setting-row">
          <span className="notification-setting-copy"><strong>{ar ? 'تحديثات السيشن' : 'Session updates'}</strong><small>{ar ? 'تغيير الموعد أو المكان وإضافة تسجيل أو ملف.' : 'Time/location changes and new recordings or resources.'}</small></span>
          <input type="checkbox" checked={preferences.session_updates} disabled={preferencesBusy} onChange={(event) => void savePreferences({ session_updates: event.target.checked })} />
        </label>

        <label className="notification-setting-row">
          <span className="notification-setting-copy"><strong>{ar ? 'محتوى جديد' : 'New content'}</strong><small>{ar ? 'إشعار عند نشر سيشن أو سلسلة جديدة.' : 'Notify me when a new session or series is published.'}</small></span>
          <input type="checkbox" checked={preferences.new_content} disabled={preferencesBusy} onChange={(event) => void savePreferences({ new_content: event.target.checked })} />
        </label>

        <label className="notification-setting-row">
          <span className="notification-setting-copy"><strong>{ar ? 'إعلانات الإدارة' : 'Admin announcements'}</strong><small>{ar ? 'الإعلانات والتنبيهات العامة المهمة.' : 'Important platform announcements and notices.'}</small></span>
          <input type="checkbox" checked={preferences.announcements} disabled={preferencesBusy} onChange={(event) => void savePreferences({ announcements: event.target.checked })} />
        </label>
      </div>}
    </section>
  </section>
}
